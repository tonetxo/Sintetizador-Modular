// src/modules/audio/effects/Reverb.js

export class Reverb {
    constructor(audioContext, x, y, id = null, initialState = {}) {
        this.audioContext = audioContext;
        this.id = id || `reverb-${Date.now()}`;
        this.x = x;
        this.y = y;
        this.width = 150;
        this.height = 220;
        this.type = 'Reverb';

        this.bypassed = initialState.bypassed || false;

        this.params = {
            mix: initialState.mix || 0.5,
            decay: initialState.decay || 2.0,
        };

        this.input = this.audioContext.createGain();
        this.output = this.audioContext.createGain();
        this.convolver = this.audioContext.createConvolver();
        this.dryGain = this.audioContext.createGain();
        this.wetGain = this.audioContext.createGain();

        this.input.connect(this.dryGain);
        this.input.connect(this.convolver);
        this.convolver.connect(this.wetGain);
        this.dryGain.connect(this.output);
        this.wetGain.connect(this.output);

        this.activeControl = null;
        this.paramHotspots = {};
        this.dragStart = {};

        this.inputs = {
            'In': { x: 0, y: this.height / 2, type: 'audio', target: this.input },
        };
        this.outputs = {
            'Out': { x: this.width, y: this.height / 2, type: 'audio', source: this.output },
        };
        
        this.createImpulseResponse();
        this.updateParams();
    }

    createImpulseResponse() {
        const sampleRate = this.audioContext.sampleRate;
        const length = sampleRate * this.params.decay;
        const impulse = this.audioContext.createBuffer(2, length, sampleRate);
        const impulseL = impulse.getChannelData(0);
        const impulseR = impulse.getChannelData(1);

        for (let i = 0; i < length; i++) {
            const n = i / length;
            impulseL[i] = (Math.random() * 2 - 1) * Math.pow(1 - n, this.params.decay);
            impulseR[i] = (Math.random() * 2 - 1) * Math.pow(1 - n, this.params.decay);
        }
        this.convolver.buffer = impulse;
    }

    updateParams() {
        const now = this.audioContext.currentTime;
        if (this.bypassed) {
            this.dryGain.gain.setTargetAtTime(1, now, 0.01);
            this.wetGain.gain.setTargetAtTime(0, now, 0.01);
            return;
        }
        this.dryGain.gain.setTargetAtTime(1 - this.params.mix, now, 0.01);
        this.wetGain.gain.setTargetAtTime(this.params.mix, now, 0.01);
    }

    toggleBypass() {
        this.bypassed = !this.bypassed;
        this.updateParams();
    }

    draw(ctx, isSelected, hoveredConnector) {
        ctx.save();
        ctx.translate(this.x, this.y);

        ctx.fillStyle = this.bypassed ? '#555' : '#222';
        ctx.strokeStyle = isSelected ? '#aaffff' : '#E0E0E0';
        ctx.lineWidth = 2;
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.strokeRect(0, 0, this.width, this.height);

        ctx.fillStyle = '#E0E0E0';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('REVERB', this.width / 2, 22);

        const sliderHeight = 160;
        const sliderY = 40;
        this.drawVerticalSlider(ctx, 'decay', 40, sliderY, sliderHeight, 0.1, 10, this.params.decay, 's');
        this.drawVerticalSlider(ctx, 'mix', 110, sliderY, sliderHeight, 0, 1, this.params.mix, '');

        this.drawConnectors(ctx, hoveredConnector);
        ctx.restore();
    }

    drawVerticalSlider(ctx, paramName, x, y, height, minVal, maxVal, currentValue, unit) {
        const knobRadius = 8;
        ctx.font = '10px Arial';
        ctx.fillStyle = '#E0E0E0';
        ctx.textAlign = 'center';
        ctx.fillText(paramName.toUpperCase(), x, y - 5);
        ctx.fillText(currentValue.toFixed(2) + (unit || ''), x, y + height + 15);
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + height);
        ctx.stroke();
        let normalizedValue = (currentValue - minVal) / (maxVal - minVal);
        const knobY = y + height - (Math.max(0, Math.min(1, normalizedValue)) * height);
        ctx.beginPath();
        ctx.arc(x, knobY, knobRadius, 0, Math.PI * 2);
        ctx.fillStyle = this.activeControl === paramName ? '#aaffff' : '#4a90e2';
        ctx.fill();
        this.paramHotspots[paramName] = { x: x - knobRadius, y, width: knobRadius * 2, height, min: minVal, max: maxVal };
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

    checkInteraction(pos) {
        const localPos = { x: pos.x - this.x, y: pos.y - this.y };
        for (const [param, rect] of Object.entries(this.paramHotspots)) {
            if (localPos.x >= rect.x && localPos.x <= rect.x + rect.width &&
                localPos.y >= rect.y && localPos.y <= rect.y + rect.height) {
                this.activeControl = param;
                this.dragStart = { y: pos.y, value: this.params[param] };
                return true;
            }
        }
        return false;
    }
    
    handleDragInteraction(worldPos) {
        if (!this.activeControl) return;
        const sliderRect = this.paramHotspots[this.activeControl];
        const localY = worldPos.y - this.y;
        let normVal = (sliderRect.y + sliderRect.height - localY) / sliderRect.height;
        normVal = Math.max(0, Math.min(1, normVal));
        const newValue = sliderRect.min + normVal * (sliderRect.max - sliderRect.min);
        this.params[this.activeControl] = newValue;
        
        if (this.activeControl === 'decay') {
            this.createImpulseResponse();
        }
        this.updateParams();
    }
    
    endInteraction() { this.activeControl = null; }

    getConnectorAt(x, y) {
        const localX = x - this.x, localY = y - this.y;
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
        this.params.mix = state.mix || 0.5;
        this.params.decay = state.decay || 2.0;
        this.bypassed = state.bypassed || false;
        this.createImpulseResponse();
        this.updateParams();
    }
    
    destroy() {
        this.input.disconnect();
        this.output.disconnect();
        this.convolver.disconnect();
        this.dryGain.disconnect();
        this.wetGain.disconnect();
    }
}