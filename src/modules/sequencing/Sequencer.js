// src/modules/sequencing/Sequencer.js

export class Sequencer {
    constructor(audioContext, x, y, id = null, initialState = {}) {
        this.audioContext = audioContext;
        this.id = id || `sequencer-${Date.now()}`;
        this.type = 'Sequencer';
        this.x = x;
        this.y = y;
        this.width = 500;
        this.height = 430;

        this.params = {
            tempo: initialState.tempo || 120,
            direction: initialState.direction || 0,
            numberOfSteps: initialState.numberOfSteps || 16,
            running: initialState.running ?? false,
            sequence: initialState.sequence || Array(16).fill(0.5),
            gateLengths: initialState.gateLengths || Array(16).fill(0.8),
            stepStates: initialState.stepStates || Array(16).fill(0),
        };
        
        this.cvNode = this.audioContext.createConstantSource();
        this.cvNode.offset.value = 0;
        this.cvNode.start();
        
        this.gateNode = this.audioContext.createConstantSource();
        this.gateNode.offset.value = 0;
        this.gateNode.start();

        this.directionModes = ['FWD', 'BWD', 'P-P', 'RND'];
        this.hotspots = {};
        this.paramHotspots = {};
        this.dragStart = {};
        this.activeControl = null;
        this.currentStep = 0;

        this.outputs = {
            'CV': { x: this.width, y: this.height - 80, type: 'cv', source: this.cvNode },
            'Gate': { x: this.width, y: this.height - 40, type: 'gate', source: this.gateNode },
        };
        this.inputs = {
            'Clock In': { 
                x: 0, y: this.height - 40, type: 'gate', target: null,
                connected: false,
                onConnect: () => { this.inputs['Clock In'].connected = true; this.updateWorkletState(); },
                onDisconnect: () => { this.inputs['Clock In'].connected = false; this.updateWorkletState(); }
            },
        };
        this.readyPromise = this.initWorklet();
    }

    async initWorklet() {
        try {
            this.workletNode = new AudioWorkletNode(this.audioContext, 'sequencer-processor');
            this.workletNode.port.onmessage = (e) => {
                if (e.data.type === 'step') {
                    this.currentStep = e.data.step;
                    this.triggerStep(e.data.gate);
                }
            };
            this.inputs['Clock In'].target = this.workletNode.parameters.get('clock_in');
            this.updateWorkletState();
        } catch (error) {
            console.error(`[Sequencer-${this.id}] Error initializing worklet:`, error);
        }
    }
    
    triggerStep(gateState) {
        const now = this.audioContext.currentTime;
        const stepStatus = this.params.stepStates[this.currentStep];
        const stepIsOn = stepStatus === 0;

        if (gateState === 'on' && stepIsOn) {
            const stepValue = this.params.sequence[this.currentStep];
            const minMidiNote = 36;
            const maxMidiNote = 84;
            const midiNote = minMidiNote + (stepValue * (maxMidiNote - minMidiNote));
            const voltage = (midiNote - 60) / 12;

            this.cvNode.offset.setTargetAtTime(voltage, now, 0.005);
            this.gateNode.offset.setTargetAtTime(1.0, now, 0.002);
        } else {
            this.gateNode.offset.setTargetAtTime(0.0, now, 0.002);
        }
    }

    updateWorkletState() {
        if (!this.workletNode) return;
        const clockInConnected = this.inputs['Clock In'].connected;
        this.workletNode.port.postMessage({ type: 'config', params: this.params, clockInConnected });
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
        ctx.fillText('SEQUENCER', this.width / 2, 22);
        const stepWidth = 28, stepSpacing = 2;
        for (let i = 0; i < 16; i++) {
            this.drawStep(ctx, i, 10 + i * (stepWidth + stepSpacing), 40, stepWidth);
        }
        
        const controlsY = 350;
        const startButtonX = 120;
        const dirSelectorX = 210;
        const buttonWidth = 60;
        const tempoKnobX = 50;

        // --- CORRECCIÓN DE POSICIÓN ---
        const centerPoint = startButtonX + buttonWidth + (dirSelectorX - (startButtonX + buttonWidth)) / 2;
        const tempoDistFromCenter = centerPoint - tempoKnobX;
        const stepsKnobX = centerPoint + tempoDistFromCenter;

        this.drawKnob(ctx, 'tempo', 'TEMPO', tempoKnobX, controlsY, 20, 300, this.params.tempo);
        this.drawButton(ctx, 'run/stop', this.params.running ? 'STOP' : 'START', startButtonX, controlsY, buttonWidth, 30);
        this.drawSelector(ctx, 'direction', 'DIR', dirSelectorX, controlsY, buttonWidth, 30, this.directionModes[this.params.direction]);
        this.drawKnob(ctx, 'numberOfSteps', 'STEPS', stepsKnobX, controlsY, 1, 16, this.params.numberOfSteps);

        this.drawConnectors(ctx, hoveredConnectorInfo);
        ctx.restore();
    }
    
    drawStep(ctx, index, x, y, width) {
        ctx.fillStyle = this.params.running && this.currentStep === index ? '#ff80ab' : '#555';
        ctx.fillRect(x, y, width, 5);
        this.drawVerticalSlider(ctx, `cv-${index}`, x + width / 2, y + 10, 160, 0, 1, this.params.sequence[index]);
        this.drawVerticalSlider(ctx, `gate-${index}`, x + width / 2, y + 180, 60, 0.01, 1, this.params.gateLengths[index]);
        const state = this.params.stepStates[index], switchY = y + 255;
        ctx.fillStyle = state === 0 ? '#4a90e2' : (state === 1 ? '#777' : '#E0E0E0');
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(state === 0 ? 'ON' : (state === 1 ? 'OFF' : 'SKIP'), x + width / 2, switchY);
    }
    
    drawVerticalSlider(ctx, paramName, x, y, height, min, max, val) {
        const knobRadius = 4;
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + height);
        ctx.stroke();
        const normalizedValue = (val - min) / (max - min);
        const knobY = y + height - (normalizedValue * height);
        ctx.beginPath();
        ctx.arc(x, knobY, knobRadius, 0, Math.PI * 2);
        ctx.fillStyle = this.activeControl === paramName ? '#aaffff' : '#4a90e2';
        ctx.fill();
        this.paramHotspots[paramName] = { x: x - knobRadius, y: y, width: knobRadius * 2, height: height, min: min, max: max };
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
        ctx.fillText(paramName === 'numberOfSteps' ? Math.round(value) : value.toFixed(0), x, y + knobRadius + 12);
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, knobRadius, startAngle, startAngle + angleRange);
        ctx.stroke();
        ctx.strokeStyle = '#4a90e2';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(angle) * knobRadius, y + Math.sin(angle) * knobRadius);
        ctx.stroke();
        this.hotspots[paramName] = { x: x - knobRadius, y: y - knobRadius, width: knobRadius * 2, height: knobRadius * 2, min, max, type: 'knob' };
    }
    
    drawButton(ctx, paramName, text, x, y, w, h) {
        ctx.fillStyle = this.params.running ? '#4a90e2' : '#333';
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
    
    drawConnectors(ctx, hovered) {
        const connectorRadius = 8;
        ctx.font = '10px Arial';
        Object.entries(this.inputs).forEach(([name, props]) => {
            const ix = props.x, iy = props.y;
            const isHovered = hovered?.module === this && hovered.connector?.name === name;
            ctx.beginPath(); ctx.arc(ix, iy, connectorRadius, 0, Math.PI * 2);
            ctx.fillStyle = isHovered ? 'white' : '#4a90e2'; ctx.fill();
            ctx.fillStyle = '#E0E0E0'; ctx.textAlign = 'left';
            ctx.fillText(name.toUpperCase(), ix + connectorRadius + 4, iy + 4);
        });
        Object.entries(this.outputs).forEach(([name, props]) => {
            const ox = props.x, oy = props.y;
            const isHovered = hovered?.module === this && hovered.connector?.name === name;
            ctx.beginPath(); ctx.arc(ox, oy, connectorRadius, 0, Math.PI * 2);
            ctx.fillStyle = isHovered ? 'white' : '#222'; ctx.fill();
            ctx.strokeStyle = '#4a90e2'; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.fillStyle = '#E0E0E0'; ctx.textAlign = 'right';
            ctx.fillText(name.toUpperCase(), ox - connectorRadius - 4, oy + 4);
        });
    }

    isInside(pos, rect) { return pos.x >= rect.x && pos.x <= rect.x + rect.width && pos.y >= rect.y && pos.y <= rect.y + rect.height; }
    
    checkInteraction(pos) {
        const localPos = { x: pos.x - this.x, y: pos.y - this.y };
        for (const [name, spot] of Object.entries(this.hotspots)) {
            if (this.isInside(localPos, spot) && spot.type === 'knob') {
                this.activeControl = name;
                this.dragStart = { y: localPos.y, value: this.params[name] };
                return true;
            }
        }
        const stepWidth = 28, stepSpacing = 2;
        for (let i = 0; i < 16; i++) {
            const stepX = 10 + i * (stepWidth + stepSpacing);
            if (this.isInside(localPos, { x: stepX, y: 50, width: stepWidth, height: 160 })) {
                this.activeControl = `cv-${i}`; return true;
            }
            if (this.isInside(localPos, { x: stepX, y: 220, width: stepWidth, height: 60 })) {
                this.activeControl = `gate-${i}`; return true;
            }
        }
        return false;
    }
    
    handleClick(x, y) {
        const localPos = { x: x - this.x, y: y - this.y };
        for (const [name, spot] of Object.entries(this.hotspots)) {
            if (this.isInside(localPos, spot)) {
                if (spot.type === 'button') {
                    if (name === 'run/stop') {
                        if (this.audioContext.state === 'suspended') this.audioContext.resume();
                        this.params.running = !this.params.running;
                        if (!this.params.running) {
                            const now = this.audioContext.currentTime;
                            this.gateNode.offset.cancelScheduledValues(now);
                            this.gateNode.offset.setTargetAtTime(0, now, 0.02);
                            this.currentStep = 0;
                        }
                        this.updateWorkletState();
                        return true;
                    }
                } else if (spot.type === 'selector') {
                    if (name === 'direction') {
                        this.params.direction = (this.params.direction + 1) % this.directionModes.length;
                        this.updateWorkletState();
                        return true;
                    }
                }
            }
        }
        const stepWidth = 28, stepSpacing = 2, switchY = 285;
        for (let i = 0; i < 16; i++) {
            const stepX = 10 + i * (stepWidth + stepSpacing);
            const switchRect = { x: stepX, y: switchY, width: stepWidth, height: 20 };
            if (this.isInside(localPos, switchRect)) {
                this.params.stepStates[i] = (this.params.stepStates[i] + 1) % 3;
                this.updateWorkletState();
                return true;
            }
        }
        return false;
    }

    handleDragInteraction(worldPos) {
        if (!this.activeControl) return;
        if (this.hotspots[this.activeControl]?.type === 'knob') {
            const hotspot = this.hotspots[this.activeControl];
            const localY = worldPos.y - this.y;
            const dy = this.dragStart.y - localY;
            const range = hotspot.max - hotspot.min;
            let newValue = this.dragStart.value + dy * (range / 128);
            newValue = Math.max(hotspot.min, Math.min(hotspot.max, newValue));
            this.params[this.activeControl] = this.activeControl === 'numberOfSteps' ? Math.round(newValue) : newValue;
        } else {
            const [type, indexStr] = this.activeControl.split('-');
            const index = parseInt(indexStr, 10);
            const localY = worldPos.y - this.y;
            let rect, min, max, paramArray;
            if (type === 'cv') [rect, min, max, paramArray] = [{ y: 50, h: 160 }, 0, 1, 'sequence'];
            else if (type === 'gate') [rect, min, max, paramArray] = [{ y: 220, h: 60 }, 0.01, 1, 'gateLengths'];
            if (!rect) return;
            let normVal = (rect.y + rect.h - localY) / rect.h;
            this.params[paramArray][index] = min + Math.max(0, Math.min(1, normVal)) * (max - min);
        }
    }
    
    endInteraction() {
        if (this.activeControl && !this.activeControl.includes('cv-') && !this.activeControl.includes('gate-')) {
            this.updateWorkletState();
        }
        this.activeControl = null;
    }
    
    getConnectorAt(x, y) {
        const localX = x - this.x;
        const localY = y - this.y;
        for (const [name, props] of Object.entries(this.inputs)) {
            if (Math.hypot(localX - props.x, localY - props.y) < 9) return { name, type: 'input', props, module: this };
        }
        for (const [name, props] of Object.entries(this.outputs)) {
            if (Math.hypot(localX - props.x, localY - props.y) < 9) return { name, type: 'output', props, module: this };
        }
        return null;
    }
    
    getState() { return { id: this.id, type: this.type, x: this.x, y: this.y, ...this.params }; }
    
    setState(state) {
        this.id = state.id || this.id;
        this.x = state.x ?? this.x;
        this.y = state.y ?? this.y;
        Object.assign(this.params, state);
        this.updateWorkletState();
    }
    
    disconnect() {
        this.cvNode?.disconnect();
        this.gateNode?.disconnect();
        if (this.workletNode) {
            this.workletNode.port.close();
            this.workletNode.disconnect();
        }
    }
}