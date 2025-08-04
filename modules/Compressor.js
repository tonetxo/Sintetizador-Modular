import { audioContext } from './AudioContext.js';

export class Compressor {
    constructor(x, y, id = null, initialState = {}) {
        this.id = id || `compressor-${Date.now()}`;
        this.x = x;
        this.y = y;
        this.width = 220;
        this.height = 300;
        this.type = 'Compressor';

        this.bypassed = initialState.bypassed || false;

        this.inputGain = audioContext.createGain();
        this.bypassGain = audioContext.createGain();
        this.outputGain = audioContext.createGain();

        this.compressor = audioContext.createDynamicsCompressor();

        this.inputGain.connect(this.compressor);
        this.compressor.connect(this.outputGain);
        this.bypassGain.connect(this.outputGain);

        this.updateBypassState();
        
        this.params = {
            threshold: initialState.threshold || -24,
            ratio: initialState.ratio || 12,
            attack: initialState.attack || 0.003,
            release: initialState.release || 0.25
        };

        this.compressor.threshold.setValueAtTime(this.params.threshold, audioContext.currentTime);
        this.compressor.ratio.setValueAtTime(this.params.ratio, audioContext.currentTime);
        this.compressor.attack.setValueAtTime(this.params.attack, audioContext.currentTime);
        this.compressor.release.setValueAtTime(this.params.release, audioContext.currentTime);

        this.activeControl = null;
        this.paramHotspots = {};

        this.inputs = {
            'audio': { x: 0, y: this.height / 2, type: 'audio', target: [this.inputGain, this.bypassGain], orientation: 'horizontal' }
        };
        this.outputs = {
            'audio': { x: this.width, y: this.height / 2, type: 'audio', source: this.outputGain, orientation: 'horizontal' }
        };
    }

    toggleBypass() {
        this.bypassed = !this.bypassed;
        this.updateBypassState();
    }

    updateBypassState() {
        if (this.bypassed) {
            this.inputGain.gain.setValueAtTime(0, audioContext.currentTime);
            this.bypassGain.gain.setValueAtTime(1, audioContext.currentTime);
        } else {
            this.inputGain.gain.setValueAtTime(1, audioContext.currentTime);
            this.bypassGain.gain.setValueAtTime(0, audioContext.currentTime);
        }
    }

    draw(ctx, isSelected, hoveredConnectorInfo) {
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
        ctx.fillText('Compresor', this.width / 2, 22);

        const sliderHeight = 240;
        const sliderY = 40;
        this.drawVerticalSlider(ctx, 'threshold', 30, sliderY, sliderHeight, -100, 0, this.params.threshold, 'dB');
        this.drawVerticalSlider(ctx, 'ratio', 80, sliderY, sliderHeight, 1, 20, this.params.ratio, ':1');
        this.drawVerticalSlider(ctx, 'attack', 130, sliderY, sliderHeight, 0, 1, this.params.attack, 's');
        this.drawVerticalSlider(ctx, 'release', 180, sliderY, sliderHeight, 0, 1, this.params.release, 's');

        ctx.restore();
        this.drawConnectors(ctx, hoveredConnectorInfo);
    }

    drawVerticalSlider(ctx, paramName, x, y, height, minVal, maxVal, currentValue, unit) {
        const knobRadius = 8;
        
        ctx.fillStyle = '#E0E0E0';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(paramName.toUpperCase(), x, y - 5);

        ctx.strokeStyle = '#555';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + height);
        ctx.stroke();

        const normalizedValue = (currentValue - minVal) / (maxVal - minVal);
        const knobY = y + height - (normalizedValue * height);

        ctx.beginPath();
        ctx.arc(x, knobY, knobRadius, 0, Math.PI * 2);
        ctx.fillStyle = this.activeControl === paramName ? '#aaffff' : '#4a90e2';
        ctx.fill();
        
        ctx.fillText(currentValue.toFixed(2) + unit, x, y + height + 15);

        this.paramHotspots[paramName] = { x: x - knobRadius, y: y, width: knobRadius * 2, height: height, min: minVal, max: maxVal };
    }
    
    drawConnectors(ctx, hovered) {
        const connectorRadius = 8;
        ctx.font = '10px Arial';

        Object.entries(this.inputs).forEach(([name, props]) => {
            const ix = this.x + props.x;
            const iy = this.y + props.y;
            ctx.beginPath();
            ctx.arc(ix, iy, connectorRadius, 0, Math.PI * 2);
            ctx.fillStyle = (hovered && hovered.module === this && hovered.connector.name === name) ? 'white' : '#4a90e2';
            ctx.fill();
            ctx.fillStyle = '#E0E0E0';
            ctx.textAlign = 'left';
            ctx.fillText('IN', ix + connectorRadius + 4, iy + 4);
        });

        Object.entries(this.outputs).forEach(([name, props]) => {
            const ox = this.x + props.x;
            const oy = this.y + props.y;
            ctx.beginPath();
            ctx.arc(ox, oy, connectorRadius, 0, Math.PI * 2);
            ctx.fillStyle = (hovered && hovered.module === this && hovered.connector.name === name) ? 'white' : '#222';
            ctx.fill();
            ctx.strokeStyle = '#4a90e2';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.fillStyle = '#E0E0E0';
            ctx.textAlign = 'right';
            ctx.fillText('OUT', ox - connectorRadius - 4, oy + 4);
        });
    }

    checkInteraction(pos) {
        const localPos = { x: pos.x - this.x, y: pos.y - this.y };
        for (const [param, rect] of Object.entries(this.paramHotspots)) {
            if (localPos.x >= rect.x && localPos.x <= rect.x + rect.width &&
                localPos.y >= rect.y && localPos.y <= rect.y + rect.height) {
                this.activeControl = param;
                return true;
            }
        }
        return false;
    }

    handleDragInteraction(worldPos) {
        if (!this.activeControl) return;

        const localY = worldPos.y - this.y;
        const sliderRect = this.paramHotspots[this.activeControl];
        
        let normalizedValue = (sliderRect.y + sliderRect.height - localY) / sliderRect.height;
        normalizedValue = Math.max(0, Math.min(1, normalizedValue));

        const newValue = sliderRect.min + normalizedValue * (sliderRect.max - sliderRect.min);
        this.params[this.activeControl] = newValue;
        this.compressor[this.activeControl].setValueAtTime(newValue, audioContext.currentTime);
    }

    endInteraction() {
        this.activeControl = null;
    }

    getConnectorAt(x, y) {
        for (const [name, props] of Object.entries(this.inputs)) {
            if (Math.sqrt(Math.pow(x - (this.x + props.x), 2) + Math.pow(y - (this.y + props.y), 2)) < 9)
                return { name, type: 'input', props, module: this };
        }
        for (const [name, props] of Object.entries(this.outputs)) {
            if (Math.sqrt(Math.pow(x - (this.x + props.x), 2) + Math.pow(y - (this.y + props.y), 2)) < 9)
                return { name, type: 'output', props, module: this };
        }
        return null;
    }
    
    disconnect() {
        this.compressor.disconnect();
    }

    getState() {
        return {
            id: this.id, type: 'Compressor', x: this.x, y: this.y,
            threshold: this.params.threshold,
            ratio: this.params.ratio,
            attack: this.params.attack,
            release: this.params.release,
            bypassed: this.bypassed
        };
    }

    setState(state) {
        this.id = state.id || this.id;
        this.x = state.x; this.y = state.y;
        this.params.threshold = state.threshold;
        this.params.ratio = state.ratio;
        this.params.attack = state.attack;
        this.params.release = state.release;
        this.bypassed = state.bypassed || false;
        
        this.compressor.threshold.setValueAtTime(this.params.threshold, audioContext.currentTime);
        this.compressor.ratio.setValueAtTime(this.params.ratio, audioContext.currentTime);
        this.compressor.attack.setValueAtTime(this.params.attack, audioContext.currentTime);
        this.compressor.release.setValueAtTime(this.params.release, audioContext.currentTime);

        this.updateBypassState();
    }
}