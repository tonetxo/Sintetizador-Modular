// src/modules/audio/effects/Compressor.js

export class Compressor {
    constructor(audioContext, x, y, id = null, initialState = {}) {
        this.audioContext = audioContext;
        this.id = id || `compressor-${Date.now()}`;
        this.x = x;
        this.y = y;
        this.width = 200;
        this.height = 320;
        this.type = 'Compressor';
        this.bypassed = initialState.bypassed || false;

        this.inputNode = this.audioContext.createGain();
        this.outputNode = this.audioContext.createGain();
        this.compressor = this.audioContext.createDynamicsCompressor();
        this.dryGain = this.audioContext.createGain();
        this.wetGain = this.audioContext.createGain();
        
        this.inputNode.connect(this.dryGain);
        this.inputNode.connect(this.compressor);
        this.compressor.connect(this.wetGain);
        this.dryGain.connect(this.outputNode);
        this.wetGain.connect(this.outputNode);

        this.params = {
            threshold: initialState.threshold || -24,
            knee: initialState.knee || 30,
            ratio: initialState.ratio || 12,
            attack: initialState.attack || 0.003,
            release: initialState.release || 0.25
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
            'In': { x: 0, y: this.height / 2, type: 'audio', target: this.inputNode }
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
            this.dryGain.gain.setTargetAtTime(0, this.audioContext.currentTime, rampTime);
            this.wetGain.gain.setTargetAtTime(1, this.audioContext.currentTime, rampTime);
        }
    }

    updateParams() {
        const now = this.audioContext.currentTime;
        this.compressor.threshold.setTargetAtTime(this.params.threshold, now, 0.01);
        this.compressor.knee.setTargetAtTime(this.params.knee, now, 0.01);
        this.compressor.ratio.setTargetAtTime(this.params.ratio, now, 0.01);
        this.compressor.attack.setTargetAtTime(this.params.attack, now, 0.01);
        this.compressor.release.setTargetAtTime(this.params.release, now, 0.01);
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
        ctx.fillText('COMPRESSOR', this.width / 2, 22);

        if (this.bypassed) {
            ctx.fillStyle = '#aaa';
            ctx.font = 'bold 12px Arial';
            ctx.fillText('BYPASS', this.width / 2, this.height / 2);
        } else {
            this.drawVerticalSlider(ctx, 'threshold', 40, 50, 240, -100, 0, this.params.threshold, 'dB');
            this.drawVerticalSlider(ctx, 'ratio', 80, 50, 240, 1, 20, this.params.ratio, ':1');
            this.drawVerticalSlider(ctx, 'attack', 120, 50, 240, 0, 1, this.params.attack, 's');
            this.drawVerticalSlider(ctx, 'release', 160, 50, 240, 0.01, 1, this.params.release, 's');
        }
        
        this.drawConnectors(ctx, hoveredConnector);
        ctx.restore();
    }

    drawVerticalSlider(ctx, param, x, y, h, min, max, val, unit) {
        const knobRadius = 8;
        ctx.font = '10px Arial';
        ctx.fillStyle = '#E0E0E0';
        ctx.textAlign = 'center';
        ctx.fillText(param.toUpperCase(), x, y - 5);
        ctx.fillText(val.toFixed(param === 'attack' || param === 'release' ? 3 : 1) + unit, x, y + h + 15);
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
        this.updateBypassState();
    }

    destroy() {
        this.inputNode.disconnect();
        this.outputNode.disconnect();
        this.compressor.disconnect();
        this.dryGain.disconnect();
        this.wetGain.disconnect();
    }
}