// src/modules/sequencing/Arpeggiator.js

export class Arpeggiator {
    constructor(audioContext, x, y, id = null, initialState = {}) {
        this.audioContext = audioContext;
        this.id = id || `arp-${Date.now()}`;
        this.x = x;
        this.y = y;
        this.width = 220;
        this.height = 280;
        this.type = 'Arpeggiator';
        
        this.params = {
            mode: initialState.mode || 'up',
            octaves: initialState.octaves || 1,
            hold: initialState.hold || false,
            running: initialState.running || false,
            tempo: initialState.tempo || 120,
            gateLength: initialState.gateLength || 0.8,
        };
        this.modes = ['up', 'down', 'up-down', 'random'];
        this.heldNotes = new Set();
        this.isClockConnected = false;
        
        this.cvNode = this.audioContext.createConstantSource();
        this.cvNode.offset.value = 0;
        this.cvNode.start();
        
        this.gateNode = this.audioContext.createConstantSource();
        this.gateNode.offset.value = 0;
        this.gateNode.start();
        
        this.hotspots = {};
        this.activeControl = null;
        this.dragStart = {};
        this.workletNode = null;
        this.noteInputProcessor = null;

        this.inputs = {
            'CV In': { x: 0, y: 50, type: 'cv', target: null },
            'Gate In': { x: 0, y: 90, type: 'gate', target: null },
            'Clock In': { 
                x: 0, y: 130, type: 'gate', target: null,
                onConnect: () => { this.isClockConnected = true; this.updateWorkletState(); },
                onDisconnect: () => { this.isClockConnected = false; this.updateWorkletState(); },
            },
        };
        this.outputs = {
            'CV': { x: this.width, y: this.height / 2 - 20, type: 'cv', source: this.cvNode },
            'Gate': { x: this.width, y: this.height / 2 + 20, type: 'gate', source: this.gateNode },
        };

        this.readyPromise = this.initWorklets();
    }

    async initWorklets() {
        try {
            this.workletNode = new AudioWorkletNode(this.audioContext, 'arpeggiator-processor');
            this.workletNode.port.onmessage = (e) => {
                if (e.data.type === 'step') {
                    this.triggerStep(e.data.midiNote, e.data.gate);
                }
            };
            this.inputs['Clock In'].target = this.workletNode.parameters.get('clock_in');

            this.noteInputProcessor = new AudioWorkletNode(this.audioContext, 'cv-to-midi-processor');
            this.noteInputProcessor.port.onmessage = (e) => {
                if (e.data.type === 'noteOn') this.onNoteDown(e.data.midiNote);
                else if (e.data.type === 'noteOff') this.onNoteUp(e.data.midiNote);
            };
            this.inputs['CV In'].target = this.noteInputProcessor.parameters.get('cvIn');
            this.inputs['Gate In'].target = this.noteInputProcessor.parameters.get('gateIn');
            
            this.updateWorkletState();
        } catch (error) {
            console.error(`[Arpeggiator-${this.id}] Error initializing worklets:`, error);
        }
    }

    triggerStep(midiNote, gateState) {
        const now = this.audioContext.currentTime;
        if (gateState === 'on' && midiNote !== null) {
            const voltage = (midiNote - 60) / 12;
            // --- CORRECCIÓN --- Añadir comprobación de seguridad para evitar el error 'non-finite'
            if (isFinite(voltage)) {
                this.cvNode.offset.setTargetAtTime(voltage, now, 0.002);
                this.gateNode.offset.setTargetAtTime(1.0, now, 0.001);
            } else {
                console.warn(`Arpeggiator received non-finite midiNote: ${midiNote}`);
            }
        } else {
            this.gateNode.offset.setTargetAtTime(0.0, now, 0.01);
        }
    }
    
    updateWorkletState() {
        if (!this.workletNode) return;
        this.workletNode.port.postMessage({
            type: 'config',
            params: this.params,
            clockInConnected: this.isClockConnected
        });
        this.workletNode.port.postMessage({
            type: 'notes',
            notes: Array.from(this.heldNotes)
        });
    }

    onNoteDown(midiNote) {
        if (!this.params.hold && this.heldNotes.size > 0) {
            this.heldNotes.clear();
        }
        this.heldNotes.add(midiNote);
        this.updateWorkletState();
    }

    onNoteUp(midiNote) {
        if (!this.params.hold) {
            this.heldNotes.delete(midiNote);
            this.updateWorkletState();
        }
    }

    draw(ctx, isSelected, hoveredConnector) {
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

        this.drawButton(ctx, 'running', this.params.running ? 'STOP' : 'START', 55, 180, 70, 25, this.params.running);
        this.drawButton(ctx, 'hold', 'HOLD', 165, 180, 70, 25, this.params.hold);
        
        this.drawSelector(ctx, 'mode', 'MODE', 55, 230, 70, 25, this.params.mode.toUpperCase());
        this.drawSelector(ctx, 'octaves', 'OCT', 165, 230, 70, 25, this.params.octaves);

        if (!this.isClockConnected) {
            this.drawKnob(ctx, 'tempo', 'TEMPO', this.width / 2, 80, 20, 300, this.params.tempo);
        }

        this.drawConnectors(ctx, hoveredConnector);
        ctx.restore();
    }
    
    drawKnob(ctx, paramName, label, x, y, min, max, value) {
        const knobRadius = 20;
        const angleRange = Math.PI * 1.5;
        const startAngle = Math.PI * 0.75;
        const normalizedValue = (value - min) / (max - min);
        const angle = startAngle + normalizedValue * angleRange;
        ctx.font = '10px Arial';
        ctx.fillStyle = '#E0E0E0';
        ctx.textAlign = 'center';
        ctx.fillText(label, x, y - knobRadius - 5);
        ctx.fillText(value.toFixed(0), x, y + knobRadius + 12);
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, knobRadius, startAngle, startAngle + angleRange);
        ctx.stroke();
        ctx.strokeStyle = this.activeControl === paramName ? '#aaffff' : '#4a90e2';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(angle) * knobRadius, y + Math.sin(angle) * knobRadius);
        ctx.stroke();
        this.hotspots[paramName] = { x: x - knobRadius, y: y - knobRadius, width: knobRadius * 2, height: knobRadius * 2, min, max, type: 'knob' };
    }
    
    drawButton(ctx, paramName, text, x, y, w, h, isActive) {
        ctx.fillStyle = isActive ? '#4a90e2' : '#333';
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1;
        ctx.fillRect(x - w / 2, y - h / 2, w, h);
        ctx.strokeRect(x - w / 2, y - h / 2, w, h);
        ctx.fillStyle = '#E0E0E0';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y);
        this.hotspots[paramName] = { x: x - w / 2, y: y - h / 2, width: w, height: h };
    }

    drawSelector(ctx, paramName, label, x, y, w, h, value) {
        ctx.fillStyle = '#333';
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1;
        ctx.fillRect(x - w / 2, y - h / 2, w, h);
        ctx.strokeRect(x - w / 2, y - h / 2, w, h);
        ctx.fillStyle = '#E0E0E0';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(label, x, y - h / 2 - 5);
        ctx.font = 'bold 12px Arial';
        ctx.textBaseline = 'middle';
        ctx.fillText(value, x, y);
        this.hotspots[paramName] = { x: x - w/2, y: y - h/2, width: w, height: h };
    }

    drawConnectors(ctx, hovered) {
        const r = 8;
        ctx.font = '10px Arial';
        Object.entries(this.inputs).forEach(([name, props]) => {
            const isHovered = hovered?.module === this && hovered.connector?.name === name;
            ctx.beginPath(); ctx.arc(props.x, props.y, r, 0, 2 * Math.PI);
            ctx.fillStyle = isHovered ? 'white' : '#4a90e2'; ctx.fill();
            ctx.fillStyle = '#E0E0E0'; ctx.textAlign = 'left';
            ctx.fillText(name, props.x + r + 4, props.y + 4);
        });
        Object.entries(this.outputs).forEach(([name, props]) => {
            const isHovered = hovered?.module === this && hovered.connector?.name === name;
            ctx.beginPath(); ctx.arc(props.x, props.y, r, 0, 2 * Math.PI);
            ctx.fillStyle = isHovered ? 'white' : '#222'; ctx.fill();
            ctx.strokeStyle = '#4a90e2'; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.fillStyle = '#E0E0E0'; ctx.textAlign = 'right';
            ctx.fillText(name, props.x - r - 4, props.y + 4);
        });
    }

    getConnectorAt(x, y) {
        const local = { x: x - this.x, y: y - this.y };
        for (const [name, props] of Object.entries(this.inputs)) {
            if (Math.hypot(local.x - props.x, local.y - props.y) < 9) return { name, type: 'input', props, module: this };
        }
        for (const [name, props] of Object.entries(this.outputs)) {
            if (Math.hypot(local.x - props.x, local.y - props.y) < 9) return { name, type: 'output', props, module: this };
        }
        return null;
    }

    handleClick(x, y) {
        const local = { x: x - this.x, y: y - this.y };
        for (const [name, spot] of Object.entries(this.hotspots)) {
            if (local.x > spot.x && local.x < spot.x + spot.width && local.y > spot.y && local.y < spot.y + spot.height) {
                if (name === 'mode') {
                    const currentIndex = this.modes.indexOf(this.params.mode);
                    this.params.mode = this.modes[(currentIndex + 1) % this.modes.length];
                } else if (name === 'octaves') {
                    this.params.octaves = (this.params.octaves % 4) + 1;
                } else if (name === 'hold') {
                    this.params.hold = !this.params.hold;
                    if (!this.params.hold && this.heldNotes.size > 0) this.heldNotes.clear();
                } else if (name === 'running') {
                    this.params.running = !this.params.running;
                }
                this.updateWorkletState();
                return true;
            }
        }
        return false;
    }
    
    checkInteraction(pos) {
        if (this.isClockConnected) return false;
        const localPos = { x: pos.x - this.x, y: pos.y - this.y };
        const knobRect = this.hotspots['tempo'];
        if (knobRect && localPos.x >= knobRect.x && localPos.x <= knobRect.x + knobRect.width &&
            localPos.y >= knobRect.y && localPos.y <= knobRect.y + knobRect.height) {
            this.activeControl = 'tempo';
            this.dragStart = { y: pos.y, value: this.params.tempo };
            return true;
        }
        return false;
    }

    handleDragInteraction(worldPos) {
        if (this.activeControl !== 'tempo') return;
        const dy = this.dragStart.y - worldPos.y;
        const range = this.hotspots.tempo.max - this.hotspots.tempo.min;
        let newValue = this.dragStart.value + dy * (range / 128);
        newValue = Math.round(Math.max(this.hotspots.tempo.min, Math.min(this.hotspots.tempo.max, newValue)));
        this.params.tempo = newValue;
        this.updateWorkletState();
    }

    endInteraction() { this.activeControl = null; }
    
    getState() { return { id: this.id, type: this.type, x: this.x, y: this.y, ...this.params }; }
    setState(state) {
        this.id = state.id || this.id;
        this.x = state.x ?? this.x;
        this.y = state.y ?? this.y;
        Object.keys(this.params).forEach(key => {
            if (state[key] !== undefined) this.params[key] = state[key];
        });
        this.updateWorkletState();
    }

    destroy() {
        this.cvNode.disconnect();
        this.gateNode.disconnect();
        this.noteInputProcessor?.port.close();
        this.noteInputProcessor?.disconnect();
        this.workletNode?.port.close();
        this.workletNode?.disconnect();
    }
}