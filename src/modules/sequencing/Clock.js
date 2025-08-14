// src/modules/sequencing/Clock.js

export class Clock {
    constructor(audioContext, x, y, id = null, initialState = {}) {
        this.audioContext = audioContext;
        this.id = id || `clock-${Date.now()}`;
        this.type = 'Clock';
        this.x = x;
        this.y = y;
        this.width = 150;
        this.height = 150;

        this.params = {
            tempo: initialState.tempo || 120,
            running: initialState.running ?? false,
        };

        this.activeControl = null;
        this.hotspots = {};
        this.dragStart = {};
        
        this.workletNode = null;
        this.outputs = {
            'Clock Out': { x: this.width, y: this.height / 2, type: 'gate', source: null },
        };
        this.inputs = {};

        this.readyPromise = this.initWorklet();
    }

    async initWorklet() {
        try {
            this.workletNode = new AudioWorkletNode(this.audioContext, 'clock-processor', {
                outputChannelCount: [1]
            });
            this.outputs['Clock Out'].source = this.workletNode;
            this.updateWorkletState();
        } catch (error) {
            console.error(`[Clock-${this.id}] Error initializing worklet:`, error);
        }
    }

    updateWorkletState() {
        if (!this.workletNode) return;
        this.workletNode.port.postMessage({ type: 'config', params: this.params });
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
        ctx.fillText('CLOCK', this.width / 2, 22);

        this.drawKnob(ctx, 'tempo', 'BPM', this.width / 2, 65, 20, 300, this.params.tempo);
        this.drawButton(ctx, 'run/stop', this.params.running ? 'STOP' : 'START', this.width / 2 - 30, 110, 60, 25);

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

    drawConnectors(ctx, hovered) {
        const connectorRadius = 8;
        ctx.font = '10px Arial';
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
    
    handleClick(x, y) {
        const localPos = { x: x - this.x, y: y - this.y };
        const buttonRect = this.hotspots['run/stop'];
        if (buttonRect && localPos.x >= buttonRect.x && localPos.x <= buttonRect.x + buttonRect.width &&
            localPos.y >= buttonRect.y && localPos.y <= buttonRect.y + buttonRect.height) {
            if (this.audioContext.state === 'suspended') this.audioContext.resume();
            this.params.running = !this.params.running;
            this.updateWorkletState();
            return true;
        }
        return false;
    }
    
    checkInteraction(pos) {
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
    
    getConnectorAt(x, y) {
        const localX = x - this.x, localY = y - this.y;
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
        this.params.tempo = state.tempo || 120;
        this.params.running = state.running || false;
        this.updateWorkletState();
    }

    destroy() { this.workletNode?.port.close(); this.workletNode?.disconnect(); }
}