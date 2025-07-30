// modules/VCF.js
import { audioContext } from './AudioContext.js';

export class VCF {
    constructor(x, y, id = null, initialState = {}) {
        this.id = id || `vcf-${Date.now()}`;
        this.x = x;
        this.y = y;
        this.width = 180; // Máis ancho
        this.height = 300; // Máis alto
        this.type = 'VCF';

        this.filter = audioContext.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.filter.frequency.setValueAtTime(1000, audioContext.currentTime);
        this.filter.Q.setValueAtTime(1, audioContext.currentTime);
        
        this.activeControl = null;
        this.paramHotspots = {};

        this.inputs = {
            'audio': { x: 0, y: this.height / 2, type: 'audio', target: this.filter, orientation: 'horizontal' },
            'CV 1': { x: this.width / 2 - 40, y: this.height, type: 'cv', target: this.filter.frequency, orientation: 'vertical' },
            'CV 2': { x: this.width / 2 + 40, y: this.height, type: 'cv', target: this.filter.frequency, orientation: 'vertical' }
        };
        this.outputs = {
            'audio': { x: this.width, y: this.height / 2, type: 'audio', source: this.filter, orientation: 'horizontal' }
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
        ctx.fillText('VCF', this.width / 2, 22);

        ctx.font = '10px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(`Cut: ${this.filter.frequency.value.toFixed(0)}Hz`, 10, 40);
        ctx.textAlign = 'right';
        ctx.fillText(`Q: ${this.filter.Q.value.toFixed(2)}`, this.width - 10, 40);

        this.drawVerticalSlider(ctx, 'cutoff', 40, 40, 220, 20, 20000, this.filter.frequency.value, 'Hz', true);
        this.drawVerticalSlider(ctx, 'q', this.width - 40, 40, 220, 0, 30, this.filter.Q.value, false);

        ctx.restore();
        this.drawConnectors(ctx, hoveredConnectorInfo);
    }

    drawVerticalSlider(ctx, paramName, x, y, height, minVal, maxVal, currentValue, unit, isLogarithmic = false) {
        const sliderWidth = 10;
        const knobRadius = 8;

        // Etiqueta
        ctx.fillStyle = '#E0E0E0';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(paramName.toUpperCase(), x, y - 18);

        // Barra del slider
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + height);
        ctx.stroke();

        // Pomo del slider
        let normalizedValue;
        if (isLogarithmic) {
            const logMin = Math.log(minVal);
            const logMax = Math.log(maxVal);
            const logCurrent = Math.log(currentValue);
            normalizedValue = (logCurrent - logMin) / (logMax - logMin);
        } else {
            normalizedValue = (currentValue - minVal) / (maxVal - minVal);
        }
        
        // ** A corrección clave: asegurar que o valor estea sempre entre 0 e 1 **
        normalizedValue = Math.max(0, Math.min(1, normalizedValue));

        const knobY = y + height - (normalizedValue * height);
        ctx.beginPath();
        ctx.arc(x, knobY, knobRadius, 0, Math.PI * 2);
        ctx.fillStyle = this.activeControl === paramName ? '#aaffff' : '#4a90e2';
        ctx.fill();
        ctx.strokeStyle = '#E0E0E0';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Valor
        ctx.fillText(`${currentValue.toFixed(1)}${unit}`, x, y + height + 15);

        // Guardar hotspot para interacción
        this.paramHotspots[paramName] = {
            x: x - knobRadius,
            y: y,
            width: knobRadius * 2,
            height: height,
            min: minVal,
            max: maxVal,
            isLog: isLogarithmic
        };
    }

    drawConnectors(ctx, hovered) {
        const isHovered = (type, name) => hovered && hovered.module === this && hovered.connector.type === type && hovered.connector.name === name;
        const connectorRadius = 8;
        ctx.font = '10px Arial';
        ctx.fillStyle = '#E0E0E0';

        Object.entries(this.inputs).forEach(([name, props]) => {
            const x = this.x + props.x;
            const y = this.y + props.y;
            ctx.beginPath();
            ctx.arc(x, y, connectorRadius, 0, Math.PI * 2);
            ctx.fillStyle = isHovered('input', name) ? 'white' : '#4a90e2';
            ctx.fill();
            ctx.fillStyle = '#E0E0E0';
            if (name === 'audio') {
                ctx.textAlign = 'left';
                ctx.fillText('ENTRADA', x + connectorRadius + 4, y + 4);
            } else {
                ctx.textAlign = 'center';
                ctx.fillText(name, x, y + connectorRadius + 12);
            }
        });

        Object.entries(this.outputs).forEach(([name, props]) => {
            const x = this.x + props.x;
            const y = this.y + props.y;
            ctx.beginPath();
            ctx.arc(x, y, connectorRadius, 0, Math.PI * 2);
            ctx.fillStyle = isHovered('output', name) ? 'white' : '#222';
            ctx.fill();
            ctx.strokeStyle = '#4a90e2';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.fillStyle = '#E0E0E0';
            ctx.textAlign = 'right';
            ctx.fillText('SALIDA', x - connectorRadius - 4, y + 4);
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

        const now = audioContext.currentTime;
        const rampTime = 0.02;

        if (this.activeControl === 'cutoff') {
            const minFreq = sliderRect.min;
            const maxFreq = sliderRect.max;
            const logMin = Math.log(minFreq);
            const logMax = Math.log(maxFreq);
            
            const logNew = logMin + normalizedValue * (logMax - logMin);
            const newFreq = Math.exp(logNew);
            
            this.filter.frequency.cancelScheduledValues(now);
            this.filter.frequency.setValueAtTime(this.filter.frequency.value, now);
            this.filter.frequency.linearRampToValueAtTime(Math.max(minFreq, Math.min(maxFreq, newFreq)), now + rampTime);

        } else if (this.activeControl === 'q') {
            const minQ = sliderRect.min;
            const maxQ = sliderRect.max;
            const newQ = minQ + normalizedValue * (maxQ - minQ);

            this.filter.Q.cancelScheduledValues(now);
            this.filter.Q.setValueAtTime(this.filter.Q.value, now);
            this.filter.Q.linearRampToValueAtTime(Math.max(minQ, Math.min(maxQ, newQ)), now + rampTime);
        }
    }

    endInteraction() {
        this.activeControl = null;
    }

    getConnectorAt(x, y) {
        for (const [name, props] of Object.entries(this.inputs)) {
            const dist = Math.sqrt(Math.pow(x - (this.x + props.x), 2) + Math.pow(y - (this.y + props.y), 2));
            if (dist < 9) return { name, type: 'input', props, module: this };
        }
        for (const [name, props] of Object.entries(this.outputs)) {
            const dist = Math.sqrt(Math.pow(x - (this.x + props.x), 2) + Math.pow(y - (this.y + props.y), 2));
            if (dist < 9) return { name, type: 'output', props, module: this };
        }
        return null;
    }

    disconnect() {
        this.filter.disconnect();
    }

    getState() {
        return {
            id: this.id,
            type: 'VCF',
            x: this.x, y: this.y,
            cutoff: this.filter.frequency.value,
            resonance: this.filter.Q.value,
            filterType: this.filter.type
        };
    }

    setState(state) {
        this.id = state.id || this.id;
        this.x = state.x; this.y = state.y;
        this.filter.frequency.setValueAtTime(state.cutoff, audioContext.currentTime);
        this.filter.Q.setValueAtTime(state.resonance, audioContext.currentTime);
        this.filter.type = state.filterType;
    }
}