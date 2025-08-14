// src/modules/audio/effects/Delay.js

export class Delay {
    constructor(audioContext, x, y, id = null, initialState = {}) {
        this.audioContext = audioContext;
        this.id = id || `delay-${Date.now()}`;
        this.x = x;
        this.y = y;
        this.width = 200;
        this.height = 280;
        this.type = 'Delay';
        this.bypassed = initialState.bypassed || false;

        this.inputNode = this.audioContext.createGain();
        this.outputNode = this.audioContext.createGain();
        this.delayNode = this.audioContext.createDelay(5.0);
        this.feedbackNode = this.audioContext.createGain();
        this.wetGain = this.audioContext.createGain();
        this.dryGain = this.audioContext.createGain();
        this.filter = this.audioContext.createBiquadFilter();

        this.inputNode.connect(this.dryGain);
        this.inputNode.connect(this.delayNode);
        this.delayNode.connect(this.filter);
        this.filter.connect(this.feedbackNode);
        this.feedbackNode.connect(this.delayNode);
        this.filter.connect(this.wetGain);
        this.dryGain.connect(this.outputNode);
        this.wetGain.connect(this.outputNode);

        this.params = {
            delayTime: initialState.delayTime || 0.5,
            feedback: initialState.feedback || 0.3,
            mix: initialState.mix || 0.5,
            filterFreq: initialState.filterFreq || 2000,
        };
        
        this.activeControl = null;
        this.paramHotspots = {};
        this.dragStart = {};

        this.setupPorts();
        this.updateParams();
        this.updateBypassState();
    }

    setupPorts() {
        this.inputs = {
            'In': { x: 0, y: this.height / 2, type: 'audio', target: this.inputNode },
            'Time CV': { x: 0, y: this.height / 2 + 40, type: 'cv', target: this.delayNode.delayTime },
            'Fbk CV': { x: 0, y: this.height / 2 + 80, type: 'cv', target: this.feedbackNode.gain }
        };
        this.outputs = {
            'Out': { x: this.width, y: this.height / 2, type: 'audio', source: this.outputNode }
        };
    }

    toggleBypass() {
        this.bypassed = !this.bypassed;
        this.updateBypassState();
    }
    
    updateBypassState() {
        const rampTime = 0.02;
        if (this.bypassed) {
            this.dryGain.gain.setTargetAtTime(1, this.audioContext.currentTime, rampTime);
            this.wetGain.gain.setTargetAtTime(0, this.audioContext.currentTime, rampTime);
        } else {
            this.dryGain.gain.setTargetAtTime(1 - this.params.mix, this.audioContext.currentTime, rampTime);
            this.wetGain.gain.setTargetAtTime(this.params.mix, this.audioContext.currentTime, rampTime);
        }
    }
    
    updateParams() {
        const now = this.audioContext.currentTime;
        this.delayNode.delayTime.setTargetAtTime(this.params.delayTime, now, 0.01);
        this.feedbackNode.gain.setTargetAtTime(this.params.feedback, now, 0.01);
        this.filter.frequency.setTargetAtTime(this.params.filterFreq, now, 0.01);
        this.updateBypassState();
    }

    draw(ctx, isSelected, hoveredConnector) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.fillStyle = this.bypassed ? '#404040' : '#222';
        ctx.strokeStyle = isSelected ? '#aaffff' : '#E0E0E0';
        ctx.lineWidth = 2;
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.strokeRect(0, 0, this.width, this.height);
        ctx.fillStyle = '#E0E0E0';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('DELAY', this.width / 2, 22);

        if (this.bypassed) {
            ctx.fillStyle = '#aaa';
            ctx.font = 'bold 12px Arial';
            ctx.fillText('BYPASS', this.width / 2, this.height / 2);
        } else {
            this.drawVerticalSlider(ctx, 'delayTime', 40, 50, 200, 0.01, 5, this.params.delayTime, 's');
            this.drawVerticalSlider(ctx, 'feedback', 80, 50, 200, 0, 0.99, this.params.feedback, '');
            this.drawVerticalSlider(ctx, 'mix', 120, 50, 200, 0, 1, this.params.mix, '');
            this.drawVerticalSlider(ctx, 'filterFreq', 160, 50, 200, 100, 10000, this.params.filterFreq, 'Hz');
        }
        
        this.drawConnectors(ctx, hoveredConnector);
        ctx.restore();
    }

    drawVerticalSlider(ctx, param, x, y, h, min, max, val, unit) {
        const knobRadius = 8;
        ctx.font = '10px Arial';
        ctx.fillStyle = '#E0E0E0';
        ctx.textAlign = 'center';
        ctx.fillText(param.replace('delayTime', 'TIME').replace('filterFreq', 'TONE').toUpperCase(), x, y - 5);
        ctx.fillText(val.toFixed(2) + unit, x, y + h + 15);
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + h);
        ctx.stroke();
        const norm = (val - min) / (max - min);
        const knobY = y + h - (norm * h);
        ctx.beginPath();
        ctx.arc(x, knobY, knobRadius, 0, Math.PI * 2);
        ctx.fillStyle = this.activeControl === param ? '#aaffff' : '#4a90e2';
        ctx.fill();
        this.paramHotspots[param] = { x: x - knobRadius, y, width: knobRadius * 2, height: h, min, max };
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

    checkInteraction(pos) {
        if (this.bypassed) return false;
        const local = { x: pos.x - this.x, y: pos.y - this.y };
        for (const [param, rect] of Object.entries(this.paramHotspots)) {
            if (local.x > rect.x && local.x < rect.x + rect.width &&
                local.y > rect.y && local.y < rect.y + rect.height) {
                this.activeControl = param;
                this.dragStart = { y: pos.y, value: this.params[param] };
                return true;
            }
        }
        return false;
    }

    handleDragInteraction(worldPos) {
        if (!this.activeControl) return;
        const rect = this.paramHotspots[this.activeControl];
        const localY = worldPos.y - this.y;
        let norm = (rect.y + rect.height - localY) / rect.height;
        norm = Math.max(0, Math.min(1, norm));
        const newValue = rect.min + norm * (rect.max - rect.min);
        this.params[this.activeControl] = newValue;
        this.updateParams();
    }

    endInteraction() { this.activeControl = null; }
    
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

    getState() { return { id: this.id, type: this.type, x: this.x, y: this.y, bypassed: this.bypassed, ...this.params }; }

    setState(state) {
        this.id = state.id || this.id;
        this.x = state.x ?? this.x;
        this.y = state.y ?? this.y;
        this.bypassed = state.bypassed || false;
        Object.keys(this.params).forEach(key => {
            if (state[key] !== undefined) this.params[key] = state[key];
        });
        this.updateParams();
    }

    destroy() {
        this.inputNode.disconnect();
        this.outputNode.disconnect();
        this.delayNode.disconnect();
        this.feedbackNode.disconnect();
        this.wetGain.disconnect();
        this.dryGain.disconnect();
        this.filter.disconnect();
    }
}