// modules/ADSR.js
// modules/ADSR.js
import { audioContext } from './AudioContext.js';

export class ADSR {
    constructor(x, y, id = null, initialState = {}) {
        this.id = id || `adsr-${Date.now()}`;
        this.x = x;
        this.y = y;
        this.width = 200;
        this.height = 220;
        this.type = 'ADSR';

        this.params = {
            attack: initialState.attack || 0.01,
            decay: initialState.decay || 0.1,
            sustain: initialState.sustain || 0.8,
            release: initialState.release || 0.2
        };

        this.activeControl = null;
        this.paramHotspots = {};

        // Crear a saída de CV (un GainNode) no construtor
        const cvOutput = audioContext.createGain();
        cvOutput.gain.value = 0; // Comeza en silencio
        
        // Conectar a unha fonte constante de 1.0 para que o Gain controle o nivel
        const constantSource = audioContext.createConstantSource();
        constantSource.offset.value = 1.0;
        constantSource.start();
        constantSource.connect(cvOutput);

        this.inputs = {
            'Gate': { x: 0, y: this.height / 2, type: 'gate', orientation: 'horizontal' }
        };
        this.outputs = {
            'CV': { x: this.width, y: this.height / 2, type: 'cv', source: cvOutput, orientation: 'horizontal' }
        };
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

        // Debuxar 4 sliders para A, D, S, R
        const sliderHeight = 140;
        const sliderY = 60;
        this.drawVerticalSlider(ctx, 'attack', 30, sliderY, sliderHeight, 0.01, 2, this.params.attack);
        this.drawVerticalSlider(ctx, 'decay', 70, sliderY, sliderHeight, 0.01, 2, this.params.decay);
        this.drawVerticalSlider(ctx, 'sustain', 110, sliderY, sliderHeight, 0, 1, this.params.sustain);
        this.drawVerticalSlider(ctx, 'release', 150, sliderY, sliderHeight, 0.01, 5, this.params.release);

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
        ctx.fillText(currentValue.toFixed(2), x, y + height + 15);

        this.paramHotspots[paramName] = { x: x - knobRadius, y: y, width: knobRadius * 2, height: height, min: minVal, max: maxVal };
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
        ctx.fillStyle = '#E0E0E0'; // Cor do texto do conector
        ctx.textAlign = 'left';
        ctx.fillText('DISPARO', ix + connectorRadius + 4, iy + 4);

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

    handleDragInteraction(worldY) {
        if (!this.activeControl) return;

        const localY = worldY - this.y;
        const sliderRect = this.paramHotspots[this.activeControl];
        
        let normalizedValue = (sliderRect.y + sliderRect.height - localY) / sliderRect.height;
        normalizedValue = Math.max(0, Math.min(1, normalizedValue));

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

    triggerOn(now) {
        const gain = this.outputs.CV.source.gain;
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(gain.value, now); // Comezar desde o valor actual
        gain.linearRampToValueAtTime(1.0, now + this.params.attack);
        gain.linearRampToValueAtTime(this.params.sustain, now + this.params.attack + this.params.decay);
    }

    triggerOff(now) {
        const gain = this.outputs.CV.source.gain;
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(gain.value, now);
        gain.linearRampToValueAtTime(0, now + this.params.release);
    }

    getState() {
        return {
            id: this.id, type: 'ADSR', x: this.x, y: this.y,
            attack: this.params.attack, decay: this.params.decay,
            sustain: this.params.sustain, release: this.params.release
        };
    }

    setState(state) {
        this.id = state.id || this.id;
        this.x = state.x; this.y = state.y;
        this.params.attack = state.attack;
        this.params.decay = state.decay;
        this.params.sustain = state.sustain;
        this.params.release = state.release;
    }
}
