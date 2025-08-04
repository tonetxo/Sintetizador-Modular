
import { audioContext } from './AudioContext.js';

export class Delay {
    constructor(x, y, id = null, initialState = {}) {
        this.id = id || `delay-${Date.now()}`;
        this.x = x;
        this.y = y;
        this.width = 200;
        this.height = 280;
        this.type = 'Delay';

        this.bypassed = initialState.bypassed || false;

        this.params = {
            time: initialState.time || 0.5,
            feedback: initialState.feedback || 0.5,
            mix: initialState.mix || 0.5
        };

        this.input = audioContext.createGain();
        this.output = audioContext.createGain();
        this.delayNode = audioContext.createDelay(5.0); // Máximo 5 segundos de delay
        this.feedbackNode = audioContext.createGain();
        this.dryGain = audioContext.createGain();
        this.wetGain = audioContext.createGain();

        this.input.connect(this.delayNode);
        this.input.connect(this.dryGain);
        this.delayNode.connect(this.feedbackNode);
        this.feedbackNode.connect(this.delayNode);
        this.delayNode.connect(this.wetGain);
        
        this.dryGain.connect(this.output);
        this.wetGain.connect(this.output);

        this.updateParams();

        this.activeControl = null;
        this.paramHotspots = {};

        this.inputs = {
            'audio': { x: 0, y: this.height / 2, type: 'audio', target: this.input, orientation: 'horizontal' }
        };
        this.outputs = {
            'audio': { x: this.width, y: this.height / 2, type: 'audio', source: this.output, orientation: 'horizontal' }
        };
    }

    updateParams() {
        if (this.bypassed) {
            this.dryGain.gain.setValueAtTime(1, audioContext.currentTime);
            this.wetGain.gain.setValueAtTime(0, audioContext.currentTime);
            return;
        }
        this.delayNode.delayTime.setValueAtTime(this.params.time, audioContext.currentTime);
        this.feedbackNode.gain.setValueAtTime(this.params.feedback, audioContext.currentTime);
        this.dryGain.gain.setValueAtTime(1 - this.params.mix, audioContext.currentTime);
        this.wetGain.gain.setValueAtTime(this.params.mix, audioContext.currentTime);
    }

    toggleBypass() {
        this.bypassed = !this.bypassed;
        this.updateParams();
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
        ctx.fillText('Delay', this.width / 2, 22);

        const sliderHeight = 220;
        const sliderY = 40;
        this.drawVerticalSlider(ctx, 'time', 40, sliderY, sliderHeight, 0, 5, this.params.time, 's');
        this.drawVerticalSlider(ctx, 'feedback', 100, sliderY, sliderHeight, 0, 0.95, this.params.feedback, '');
        this.drawVerticalSlider(ctx, 'mix', 160, sliderY, sliderHeight, 0, 1, this.params.mix, '');

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
        this.updateParams();
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
        this.input.disconnect();
        this.output.disconnect();
        this.delayNode.disconnect();
        this.feedbackNode.disconnect();
        this.dryGain.disconnect();
        this.wetGain.disconnect();
    }

    getState() {
        return {
            id: this.id, type: 'Delay', x: this.x, y: this.y,
            time: this.params.time,
            feedback: this.params.feedback,
            mix: this.params.mix,
            bypassed: this.bypassed
        };
    }

    setState(state) {
        this.id = state.id || this.id;
        this.x = state.x; this.y = state.y;
        this.params.time = state.time;
        this.params.feedback = state.feedback;
        this.params.mix = state.mix;
        this.bypassed = state.bypassed || false;
        this.updateParams();
    }
}
