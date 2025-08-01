// modules/ADSR.js
import { audioContext } from './AudioContext.js';

export class ADSR {
    constructor(x, y, id = null, initialState = {}) {
        this.id = id || `adsr-${Date.now()}`;
        this.x = x;
        this.y = y;
        this.width = 400;
        this.height = 300;
        this.type = 'ADSR';

        this.params = {
            attack: initialState.attack || 0.01,
            decay: initialState.decay || 0.1,
            sustain: initialState.sustain || 0.8,
            release: initialState.release || 0.2
        };

        this.activeControl = null;
        this.paramHotspots = {};

        this.readyPromise = this.initWorklet(initialState);
    }

    async initWorklet(initialState) {
        try {
            this.workletNode = new AudioWorkletNode(audioContext, 'adsr-processor', {
                numberOfInputs: 1,
                numberOfOutputs: 1,
                outputChannelCount: [1],
                parameterData: {
                    attack: this.params.attack,
                    decay: this.params.decay,
                    sustain: this.params.sustain,
                    release: this.params.release,
                }
            });

            this.inputs = {
                'Gate': { x: 0, y: this.height / 2, type: 'gate', target: this.workletNode, orientation: 'horizontal' }
            };
            this.outputs = {
                'CV': { x: this.width, y: this.height / 2, type: 'cv', source: this.workletNode, orientation: 'horizontal' }
            };

            // Conectar los parámetros para control en tiempo real
            this.attackParam = this.workletNode.parameters.get('attack');
            this.decayParam = this.workletNode.parameters.get('decay');
            this.sustainParam = this.workletNode.parameters.get('sustain');
            this.releaseParam = this.workletNode.parameters.get('release');

            if (initialState && Object.keys(initialState).length > 0) {
                this.setState(initialState);
            }

        } catch (error) {
            console.error(`[ADSR-${this.id}] Error initializing worklet:`, error);
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
        ctx.fillText('ADSR', this.width / 2, 22);

        const sliderHeight = 240;
        const sliderY = 40;
        this.drawVerticalSlider(ctx, 'attack', 60, sliderY, sliderHeight, 0.01, 2, this.params.attack);
        this.drawVerticalSlider(ctx, 'decay', 140, sliderY, sliderHeight, 0.01, 2, this.params.decay);
        this.drawVerticalSlider(ctx, 'sustain', 220, sliderY, sliderHeight, 0, 1, this.params.sustain);
        this.drawVerticalSlider(ctx, 'release', 300, sliderY, sliderHeight, 0.01, 5, this.params.release);

        ctx.restore();
        this.drawConnectors(ctx, hoveredConnectorInfo);
    }

    drawVerticalSlider(ctx, paramName, x, y, height, minVal, maxVal, currentValue) {
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

        const normalizedValue = Math.max(0, Math.min(1, (currentValue - minVal) / (maxVal - minVal)));
        const knobY = y + height - (normalizedValue * height);

        ctx.beginPath();
        ctx.arc(x, knobY, knobRadius, 0, Math.PI * 2);
        ctx.fillStyle = this.activeControl === paramName ? '#aaffff' : '#4a90e2';
        ctx.fill();
        ctx.strokeStyle = '#E0E0E0';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
        ctx.fillText(currentValue.toFixed(2), x, y + height + 15);

        this.paramHotspots[paramName] = { x: x - knobRadius, y: y, width: knobRadius * 2, height: height, min: minVal, max: maxVal };
    }
    
    drawConnectors(ctx, hovered) {
        const connectorRadius = 8;
        ctx.font = '10px Arial';

        const inputName = 'Gate';
        const inputProps = this.inputs[inputName];
        const ix = this.x + inputProps.x;
        const iy = this.y + inputProps.y;
        ctx.beginPath();
        ctx.arc(ix, iy, connectorRadius, 0, Math.PI * 2);
        ctx.fillStyle = (hovered && hovered.module === this && hovered.connector.name === inputName) ? 'white' : '#4a90e2';
        ctx.fill();
        ctx.fillStyle = '#E0E0E0';
        ctx.textAlign = 'left';
        ctx.fillText('DISPARO', ix + connectorRadius + 4, iy + 4);

        const outputName = 'CV';
        const outputProps = this.outputs[outputName];
        const ox = this.x + outputProps.x;
        const oy = this.y + outputProps.y;
        ctx.beginPath();
        ctx.arc(ox, oy, connectorRadius, 0, Math.PI * 2);
        ctx.fillStyle = (hovered && hovered.module === this && hovered.connector.name === outputName) ? 'white' : '#222';
        ctx.fill();
        ctx.strokeStyle = '#4a90e2';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = '#E0E0E0';
        ctx.textAlign = 'right';
        ctx.fillText('CV', ox - connectorRadius - 4, oy + 4);
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

        // Actualizar el AudioParam correspondiente
        const param = this[`${this.activeControl}Param`];
        if (param) {
            param.setValueAtTime(newValue, audioContext.currentTime);
        }
    }

    endInteraction() {
        this.activeControl = null;
    }

    getConnectorAt(x, y) {
        const localX = x - this.x;
        const localY = y - this.y;
        for (const [name, props] of Object.entries(this.inputs)) {
            if (Math.sqrt(Math.pow(localX - props.x, 2) + Math.pow(localY - props.y, 2)) < 9)
                return { name, type: 'input', props, module: this };
        }
        for (const [name, props] of Object.entries(this.outputs)) {
            if (Math.sqrt(Math.pow(localX - props.x, 2) + Math.pow(localY - props.y, 2)) < 9)
                return { name, type: 'output', props, module: this };
        }
        return null;
    }

    disconnect() {
        if (this.workletNode) {
            this.workletNode.disconnect();
        }
    }

    getState() {
        return {
            id: this.id, type: 'ADSR', x: this.x, y: this.y,
            ...this.params
        };
    }

    setState(state) {
        this.id = state.id || this.id;
        this.x = state.x; this.y = state.y;
        Object.assign(this.params, state);

        if (this.workletNode) {
            this.attackParam.setValueAtTime(this.params.attack, audioContext.currentTime);
            this.decayParam.setValueAtTime(this.params.decay, audioContext.currentTime);
            this.sustainParam.setValueAtTime(this.params.sustain, audioContext.currentTime);
            this.releaseParam.setValueAtTime(this.params.release, audioContext.currentTime);
        }
    }
}