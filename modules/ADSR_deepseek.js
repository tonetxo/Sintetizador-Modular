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

        // Parámetros con valores mínimos razonables
        this.params = {
            attack: initialState.attack || 0.01,
            decay: initialState.decay || 0.1,
            sustain: initialState.sustain || 0.8,
            release: initialState.release || 0.2
        };

        this.activeControl = null;
        this.paramHotspots = {};
        
        // Crear el output del envelope
        this.envelopeOutput = audioContext.createGain();
        this.envelopeOutput.gain.value = 0;
        this.envelopeOutput.gain.setValueAtTime(0, audioContext.currentTime);

        this.inputs = {
            'Gate': { 
                x: 0, 
                y: this.height / 2, 
                type: 'gate', 
                orientation: 'horizontal',
                target: this,
                onGateOn: (time) => this.triggerOn(time),
                onGateOff: (time) => this.triggerOff(time)
            }
        };
        
        this.outputs = {
            'CV': { 
                x: this.width, 
                y: this.height / 2, 
                type: 'cv', 
                source: this.envelopeOutput, 
                orientation: 'horizontal',
                outputIndex: 0
            }
        };

        if (Object.keys(initialState).length > 0) {
            this.setState(initialState);
        }
    }

    draw(ctx, isSelected, hoveredConnectorInfo) {
        ctx.save();
        ctx.translate(this.x, this.y);

        // Caja principal
        ctx.fillStyle = '#222';
        ctx.strokeStyle = isSelected ? '#aaffff' : '#E0E0E0';
        ctx.lineWidth = 2;
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.strokeRect(0, 0, this.width, this.height);

        // Título
        ctx.fillStyle = '#E0E0E0';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('ADSR', this.width / 2, 22);

        // Sliders para los parámetros
        const sliderHeight = 200;
        const sliderY = 50;
        this.drawVerticalSlider(ctx, 'attack', 60, sliderY, sliderHeight, 0.001, 2, this.params.attack);
        this.drawVerticalSlider(ctx, 'decay', 140, sliderY, sliderHeight, 0.001, 2, this.params.decay);
        this.drawVerticalSlider(ctx, 'sustain', 220, sliderY, sliderHeight, 0, 1, this.params.sustain);
        this.drawVerticalSlider(ctx, 'release', 300, sliderY, sliderHeight, 0.001, 5, this.params.release);

        // Visualización del envelope
        this.drawEnvelopePreview(ctx, 30, sliderY, 20, sliderHeight);

        ctx.restore();
        this.drawConnectors(ctx, hoveredConnectorInfo);
    }

    drawVerticalSlider(ctx, paramName, x, y, height, minVal, maxVal, currentValue) {
        const knobRadius = 8;
        
        // Etiqueta
        ctx.fillStyle = '#E0E0E0';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(paramName.toUpperCase(), x, y - 5);

        // Barra
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + height);
        ctx.stroke();

        // Pomo
        const normalizedValue = Math.max(0, Math.min(1, (currentValue - minVal) / (maxVal - minVal)));
        const knobY = y + height - (normalizedValue * height);

        ctx.beginPath();
        ctx.arc(x, knobY, knobRadius, 0, Math.PI * 2);
        ctx.fillStyle = this.activeControl === paramName ? '#aaffff' : '#4a90e2';
        ctx.fill();
        ctx.strokeStyle = '#E0E0E0';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
        // Valor
        ctx.fillStyle = '#E0E0E0';
        ctx.fillText(currentValue.toFixed(2), x, y + height + 15);

        // Guardar área interactiva
        this.paramHotspots[paramName] = { 
            x: x - knobRadius, 
            y: y, 
            width: knobRadius * 2, 
            height: height, 
            min: minVal, 
            max: maxVal 
        };
    }

    drawEnvelopePreview(ctx, x, y, width, height) {
        const attackX = x + width * (this.params.attack / 2);
        const decayX = attackX + width * (this.params.decay / 2);
        const releaseX = decayX + width * 0.5;
        const sustainY = y + height * (1 - this.params.sustain);
        const endX = releaseX + width * (this.params.release / 2);

        ctx.strokeStyle = '#4a90e2';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y + height);
        
        // Attack
        ctx.lineTo(attackX, y);
        
        // Decay
        ctx.lineTo(decayX, sustainY);
        
        // Release (solo como preview)
        ctx.lineTo(endX, sustainY);
        ctx.lineTo(endX, y + height);
        
        ctx.stroke();
    }
    
    drawConnectors(ctx, hovered) {
        const connectorRadius = 8;
        ctx.font = '10px Arial';

        // Input
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
        ctx.fillText('GATE', ix + connectorRadius + 4, iy + 4);

        // Output
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

        // Aplicar curva no lineal para mejor control en valores bajos
        if (this.activeControl !== 'sustain') {
            normalizedValue = Math.pow(normalizedValue, 0.5);
        }

        this.params[this.activeControl] = sliderRect.min + normalizedValue * (sliderRect.max - sliderRect.min);
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

    triggerOn(now = audioContext.currentTime) {
        const gain = this.envelopeOutput.gain;
        const currentValue = gain.value;
        
        // Cancelar cualquier envelope programado
        gain.cancelScheduledValues(now);
        
        // Si el valor actual es muy bajo, comenzar desde 0
        const startValue = currentValue < 0.001 ? 0 : currentValue;
        gain.setValueAtTime(startValue, now);
        
        // Attack phase
        const attackEnd = now + this.params.attack;
        gain.exponentialRampToValueAtTime(1.0, attackEnd);
        
        // Decay phase
        const decayEnd = attackEnd + this.params.decay;
        gain.exponentialRampToValueAtTime(this.params.sustain, decayEnd);
    }

    triggerOff(now = audioContext.currentTime) {
        const gain = this.envelopeOutput.gain;
        const currentValue = gain.value;
        
        // Cancelar cualquier envelope programado
        gain.cancelScheduledValues(now);
        
        // Comenzar desde el valor actual
        gain.setValueAtTime(currentValue, now);
        
        // Release phase
        gain.exponentialRampToValueAtTime(0, now + this.params.release);
    }

    disconnect() {
        this.envelopeOutput.disconnect();
    }

    getState() {
        return {
            id: this.id, 
            type: 'ADSR', 
            x: this.x, 
            y: this.y,
            attack: this.params.attack, 
            decay: this.params.decay,
            sustain: this.params.sustain, 
            release: this.params.release
        };
    }

    setState(state) {
        this.id = state.id || this.id;
        this.x = state.x; 
        this.y = state.y;
        
        if (state.attack !== undefined) this.params.attack = Math.max(0.001, state.attack);
        if (state.decay !== undefined) this.params.decay = Math.max(0.001, state.decay);
        if (state.sustain !== undefined) this.params.sustain = Math.max(0, Math.min(1, state.sustain));
        if (state.release !== undefined) this.params.release = Math.max(0.001, state.release);
    }
}