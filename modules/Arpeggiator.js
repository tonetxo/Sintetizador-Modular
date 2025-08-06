// modules/Arpeggiator.js
import { audioContext } from './AudioContext.js';

export class Arpeggiator {
    constructor(x, y, id = null, initialState = {}) {
        this.id = id || `arpeggiator-${Date.now()}`;
        this.type = 'Arpeggiator';
        this.x = x;
        this.y = y;
        this.width = 250;
        this.height = 320; // Aumentar altura para el slider de portamento

        this.params = {
            tempo: initialState.tempo || 120,
            mode: initialState.mode || 0, // 0: Up, 1: Down, 2: Up-Down, 3: Random
            octaveRange: initialState.octaveRange || 0, // 0: current, 1: +1 octave, 2: +2 octaves
            gateLength: initialState.gateLength !== undefined ? initialState.gateLength : 0.8,
            hold: initialState.hold !== undefined ? initialState.hold : false,
            running: initialState.running !== undefined ? initialState.running : false,
        };

        this.modeNames = ['Up', 'Down', 'Up-Down', 'Random'];
        this.octaveRangeNames = ['0 Oct', '+1 Oct', '+2 Oct'];

        this.cvNode = audioContext.createConstantSource();
        this.cvNode.offset.value = 0;
        this.cvNode.start();
        
        const dummyGainCV = audioContext.createGain();
        dummyGainCV.gain.value = 0;
        this.cvNode.connect(dummyGainCV);
        dummyGainCV.connect(audioContext.destination);

        this.gateNode = audioContext.createConstantSource();
        this.gateNode.offset.value = 0;
        this.gateNode.start();

        const dummyGainGate = audioContext.createGain();
        dummyGainGate.gain.value = 0;
        this.gateNode.connect(dummyGainGate);
        dummyGainGate.connect(audioContext.destination);
        
        this.outputs = {
            'TENSION': { x: this.width, y: this.height - 80, type: 'cv', source: this.cvNode, orientation: 'horizontal' },
            'DISPARO': { x: this.width, y: this.height - 40, type: 'gate', source: this.gateNode, orientation: 'horizontal' },
        };
        
        this.hotspots = {};
        this.dragStart = {};
        this.activeControl = null;

        this.activeMidiNotes = new Set();
        this.latchedMidiNotes = new Set();

        // --- Portamento ---
        this.portamentoValue = initialState.portamentoValue !== undefined ? initialState.portamentoValue : 0.0; // 0.0 = no portamento
        this.portamentoTime = 0; // Calculated from portamentoValue
        this.recalculatePortamentoTime();
        
        // Inicialización asíncrona que define las entradas
        this.readyPromise = this.initWorklets();
    }
    
    async initWorklets() {
        try {
            // Inicializar el worklet del arpegiador
            await audioContext.audioWorklet.addModule('./worklets/arpeggiator-processor.js');
            this.workletNode = new AudioWorkletNode(audioContext, 'arpeggiator-processor');
            this.workletNode.port.onmessage = (e) => {
                if (e.data.type === 'step') {
                    this.triggerStep(e.data.midiNote, e.data.gate);
                }
            };
            
            // Inicializar el worklet de CV a MIDI
            await audioContext.audioWorklet.addModule('./worklets/cv-to-midi-processor.js');
            this.cvToMidiWorkletNode = new AudioWorkletNode(audioContext, 'cv-to-midi-processor');
            
            // Workaround para mantenerlo activo
            const dummyGainCvMidi = audioContext.createGain();
            dummyGainCvMidi.gain.value = 0;
            this.cvToMidiWorkletNode.connect(dummyGainCvMidi);
            dummyGainCvMidi.connect(audioContext.destination);

            this.cvToMidiWorkletNode.port.onmessage = (e) => {
                if (e.data.type === 'noteOn') {
                    if (this.params.hold) {
                        this.latchedMidiNotes.add(e.data.midiNote);
                    } else {
                        this.activeMidiNotes.add(e.data.midiNote);
                    }
                    this.sendNotesToWorklet();
                } else if (e.data.type === 'noteOff') {
                    if (!this.params.hold) {
                        this.activeMidiNotes.delete(e.data.midiNote);
                        this.sendNotesToWorklet();
                    }
                }
            };

            // **Definir las entradas aquí, después de que los worklets estén listos**
            this.inputs = {
                'GATE_IN': { x: 0, y: 40, type: 'gate', target: this.cvToMidiWorkletNode.parameters.get('gateIn'), orientation: 'horizontal' },
                'CV_IN': { x: 0, y: 80, type: 'cv', target: this.cvToMidiWorkletNode.parameters.get('cvIn'), orientation: 'horizontal' },
                'CLOCK_IN': { x: 0, y: 120, type: 'gate', target: null, orientation: 'horizontal' }, // Lógica de clock pendiente
            };
            
            this.updateWorkletState();

        } catch (error) {
            console.error(`[Arpeggiator-${this.id}] Error initializing worklets:`, error);
        }
    }

    updateWorkletState() {
        if (!this.workletNode) return;
        this.workletNode.port.postMessage({ type: 'config', params: this.params });
        this.sendNotesToWorklet();
    }

    sendNotesToWorklet() {
        if (!this.workletNode) return;
        const notesToSend = this.params.hold ? Array.from(this.latchedMidiNotes) : Array.from(this.activeMidiNotes);
        this.workletNode.port.postMessage({ type: 'notes', notes: notesToSend });
    }

    recalculatePortamentoTime() {
        // Map portamentoValue (0-1) to a time range (e.g., 0 to 1 second)
        // Using a power curve for more sensitive control at lower values
        this.portamentoTime = Math.pow(this.portamentoValue, 2) * 1.0; // Max 1 second
    }

    triggerStep(midiNote, gateState) {
        const now = audioContext.currentTime;
        const voltage = (midiNote - 60) / 12; // C4 (MIDI 60) = 0V

        if (gateState === 'on') {
            this.cvNode.offset.cancelScheduledValues(now);
            // Apply portamento here
            this.cvNode.offset.linearRampToValueAtTime(voltage, now + this.portamentoTime);
            this.gateNode.offset.cancelScheduledValues(now);
            this.gateNode.offset.setTargetAtTime(1.0, now, 0.002);
        } else {
            this.gateNode.offset.setTargetAtTime(0.0, now, 0.002);
        }
    }

    clearNotes() {
        this.activeMidiNotes.clear();
        this.latchedMidiNotes.clear();
        this.sendNotesToWorklet();
    }
    
    handleClick(x, y) {
        const localPos = { x: x - this.x, y: y - this.y };
        for (const [name, spot] of Object.entries(this.hotspots)) {
            if (this.isInside(localPos, spot)) {
                if (spot.type === 'button' && name === 'run/stop') {
                    if (audioContext.state === 'suspended') audioContext.resume();
                    this.params.running = !this.params.running;
                    if (!this.params.running) {
                        this.gateNode.offset.setTargetAtTime(0, audioContext.currentTime, 0.02);
                        this.clearNotes(); // Clear notes when stopping
                    }
                    this.updateWorkletState();
                    return true;
                }
                if (spot.type === 'button' && name === 'hold') {
                    this.params.hold = !this.params.hold;
                    if (!this.params.hold) {
                        this.latchedMidiNotes.clear(); // Clear latched notes when hold is off
                        this.sendNotesToWorklet();
                    }
                    this.updateWorkletState();
                    return true;
                }
                if (spot.type === 'selector' && name === 'mode') {
                    this.params.mode = (this.params.mode + 1) % this.modeNames.length;
                    this.updateWorkletState();
                    return true;
                }
                if (spot.type === 'selector' && name === 'octaveRange') {
                    this.params.octaveRange = (this.params.octaveRange + 1) % this.octaveRangeNames.length;
                    this.updateWorkletState();
                    return true;
                }
            }
        }
        return false;
    }

    checkInteraction(pos) {
        const localPos = { x: pos.x - this.x, y: pos.y - this.y };
        for (const [name, spot] of Object.entries(this.hotspots)) {
            if (this.isInside(localPos, spot) && (spot.type === 'knob' || spot.type === 'slider')) {
                this.activeControl = name;
                let initialValue;
                if (spot.type === 'knob') {
                    initialValue = this.params[name];
                } else if (spot.type === 'slider') {
                    initialValue = this[name];
                }
                this.dragStart = { y: localPos.y, x: localPos.x, value: initialValue };
                return true;
            }
        }
        return false;
    }
    
    endInteraction() {
        if (this.activeControl) {
            if (this.activeControl === 'portamentoValue') {
                this.recalculatePortamentoTime();
            }
            this.updateWorkletState();
            this.activeControl = null;
            this.dragStart = {};
        }
    }
    
    handleDragInteraction(worldPos) {
        if (!this.activeControl) return;
        const hotspot = this.hotspots[this.activeControl];
        
        if (hotspot?.type === 'knob') {
            const localY = worldPos.y - this.y;
            const dy = this.dragStart.y - localY;
            const range = hotspot.max - hotspot.min;
            let newValue = this.dragStart.value + dy * (range / 128); // Sensitivity
            newValue = Math.max(hotspot.min, Math.min(hotspot.max, newValue));
            this.params[this.activeControl] = newValue;
        } else if (hotspot?.type === 'slider') {
            const localX = worldPos.x - this.x;
            const dx = localX - this.dragStart.x;
            const range = hotspot.max - hotspot.min;
            let newValue = this.dragStart.value + dx * (range / hotspot.width); // Sensitivity based on slider width
            newValue = Math.max(hotspot.min, Math.min(hotspot.max, newValue));
            this[this.activeControl] = newValue;
        }
    }

    draw(ctx, isSelected, hoveredConnectorInfo) {
        ctx.save();
        ctx.translate(this.x, this.y);

        ctx.fillStyle = '#222';
        ctx.strokeStyle = isSelected ? '#aaffff' : '#E0E0E0';
        ctx.lineWidth = 2;
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.strokeRect(0, 0, this.width, this.height);

        ctx.fillStyle = '#E0E0E0';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('ARPEGGIATOR', this.width / 2, 22);

        // Controls
        const controlsY = 50;
        const col1X = 60;
        const col2X = this.width - 60;

        this.drawKnob(ctx, 'tempo', 'TEMPO', col1X, controlsY, 20, 300, this.params.tempo);
        this.drawKnob(ctx, 'gateLength', 'GATE', col2X, controlsY, 0.01, 1, this.params.gateLength);

        const buttonY = controlsY + 70;
        this.drawButton(ctx, 'run/stop', this.params.running ? 'STOP' : 'START', col1X - 30, buttonY, 60, 30);
        this.drawButton(ctx, 'hold', this.params.hold ? 'HOLD ON' : 'HOLD OFF', col2X - 30, buttonY, 60, 30);

        const selectorY = buttonY + 50;
        this.drawSelector(ctx, 'mode', 'MODE', col1X - 30, selectorY, 60, 30, this.modeNames[this.params.mode]);
        this.drawSelector(ctx, 'octaveRange', 'OCT RANGE', col2X - 30, selectorY, 60, 30, this.octaveRangeNames[this.params.octaveRange]);

        // Portamento Slider
        const portamentoY = selectorY + 50;
        this.drawHorizontalSlider(ctx, 'portamentoValue', this.width / 2 - 80, portamentoY, 160, 0, 1, this.portamentoValue, 'PORTAMENTO');

        this.drawConnectors(ctx, hoveredConnectorInfo);
        ctx.restore();
    }

    drawKnob(ctx, paramName, label, x, y, min, max, value) {
        const knobRadius = 18;
        const angleRange = Math.PI * 1.5;
        const startAngle = Math.PI * 0.75;
        const normalizedValue = (value - min) / (max - min);
        const angle = startAngle + normalizedValue * angleRange;

        ctx.font = '10px Arial';
        ctx.fillStyle = '#E0E0E0';
        ctx.textAlign = 'center';
        ctx.fillText(label, x, y - knobRadius - 5);
        ctx.fillText(value.toFixed(1), x, y + knobRadius + 12);

        ctx.strokeStyle = '#555';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, knobRadius, startAngle, startAngle + angleRange);
        ctx.stroke();

        ctx.strokeStyle = this.activeControl === paramName ? '#aaffff' : '#4a90e2'; // Color activo
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(angle) * knobRadius, y + Math.sin(angle) * knobRadius);
        ctx.stroke();

        this.hotspots[paramName] = { x: x - knobRadius, y: y - knobRadius, width: knobRadius * 2, height: knobRadius * 2, min, max, type: 'knob' };
    }

    drawButton(ctx, paramName, text, x, y, w, h) {
        ctx.fillStyle = this.params[paramName.split('/')[0]] ? '#4a90e2' : '#333'; // For run/stop and hold
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1;
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = '#E0E0E0';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x + w / 2, y + h / 2);
        this.hotspots[paramName] = { x, y, width: w, height: h, type: 'button' };
    }

    drawSelector(ctx, paramName, label, x, y, w, h, value) {
        ctx.fillStyle = '#333';
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1;
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = '#E0E0E0';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(label, x + w / 2, y - 5);
        ctx.font = 'bold 12px Arial';
        ctx.textBaseline = 'middle';
        ctx.fillText(value, x + w / 2, y + h / 2);
        this.hotspots[paramName] = { x, y, width: w, height: h, type: 'selector' };
    }

    drawHorizontalSlider(ctx, paramName, x, y, width, minVal, maxVal, currentValue, label) {
        const knobRadius = 8;
        ctx.fillStyle = '#E0E0E0';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(label, x + width / 2, y - 5);

        ctx.strokeStyle = '#555';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + width, y);
        ctx.stroke();

        const normalizedValue = (currentValue - minVal) / (maxVal - minVal);
        const knobX = x + normalizedValue * width;

        ctx.beginPath();
        ctx.arc(knobX, y, knobRadius, 0, Math.PI * 2);
        ctx.fillStyle = this.activeControl === paramName ? '#aaffff' : '#4a90e2';
        ctx.fill();
        ctx.strokeStyle = '#E0E0E0';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillText(currentValue.toFixed(2), x + width / 2, y + knobRadius + 12);

        this.hotspots[paramName] = { x: x, y: y - knobRadius, width: width, height: knobRadius * 2, min: minVal, max: maxVal, type: 'slider' };
    }

    drawConnectors(ctx, hovered) {
        if (!this.inputs) return; // No dibujar si las entradas aún no están listas
        const connectorRadius = 8;
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';

        // Inputs
        Object.entries(this.inputs).forEach(([name, props]) => {
            const isHovered = hovered?.module === this && hovered?.connector.name === name;
            const ix = props.x, iy = props.y;
            ctx.beginPath();
            ctx.arc(ix, iy, connectorRadius, 0, Math.PI * 2);
            ctx.fillStyle = isHovered ? 'white' : '#4a90e2';
            ctx.fill();
            ctx.fillStyle = '#E0E0E0';
            ctx.textAlign = 'left';
            ctx.fillText(name, ix + connectorRadius + 4, iy + 4);
        });

        // Outputs
        Object.entries(this.outputs).forEach(([name, props]) => {
            const isHovered = hovered?.module === this && hovered?.connector.name === name;
            const ox = props.x, oy = props.y;
            ctx.beginPath();
            ctx.arc(ox, oy, connectorRadius, 0, Math.PI * 2);
            ctx.fillStyle = isHovered ? 'white' : '#222';
            ctx.fill();
            ctx.strokeStyle = '#4a90e2';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.fillStyle = '#E0E0E0';
            ctx.textAlign = 'right';
            ctx.fillText(name.toUpperCase(), ox - connectorRadius - 4, oy + 4);
        });
    }

    isInside(pos, rect) {
        return pos.x >= rect.x && pos.x <= rect.x + rect.width && pos.y >= rect.y && pos.y <= rect.y + rect.height;
    }

    getConnectorAt(x, y) {
        if (!this.inputs) return null;
        const localX = x - this.x, localY = y - this.y;
        for (const [name, props] of Object.entries(this.inputs)) {
            if (Math.hypot(localX - props.x, localY - props.y) < 9) return { name, type: 'input', props, module: this };
        }
        for (const [name, props] of Object.entries(this.outputs)) {
            if (Math.hypot(localX - props.x, localY - props.y) < 9) return { name, type: 'output', props, module: this };
        }
        return null;
    }

    getState() {
        return {
            id: this.id,
            type: this.type,
            x: this.x,
            y: this.y,
            portamentoValue: this.portamentoValue,
            ...this.params,
        };
    }

    setState(state) {
        this.id = state.id || this.id;
        this.x = state.x;
        this.y = state.y;
        Object.assign(this.params, state);
        this.portamentoValue = state.portamentoValue !== undefined ? state.portamentoValue : 0.0;
        this.recalculatePortamentoTime();
        if (this.readyPromise) {
            this.readyPromise.then(() => this.updateWorkletState());
        }
    }

    disconnect() {
        this.cvNode?.disconnect();
        this.gateNode?.disconnect();
        this.workletNode?.port.close();
        this.cvToMidiWorkletNode?.port.close();
    }
}