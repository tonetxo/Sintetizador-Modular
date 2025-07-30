// modules/VCF.js
import { audioContext } from './AudioContext.js';

export class VCF {
    constructor(x, y, id = null, initialState = {}) {
        this.id = id || `vcf-${Date.now()}`;
        this.x = x;
        this.y = y;
        this.width = 160;
        this.height = 180;
        this.type = 'VCF';

        this.filter = audioContext.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.filter.frequency.setValueAtTime(1000, audioContext.currentTime);
        this.filter.Q.setValueAtTime(1, audioContext.currentTime);
        
        this.activeControl = null;
        this.paramHotspots = {};

        this.inputs = {
            'audio': { x: 0, y: this.height / 2, type: 'audio', target: this.filter, orientation: 'horizontal' },
            'CV 1': { x: this.width / 2 - 30, y: this.height, type: 'cv', target: this.filter.frequency, orientation: 'vertical' },
            'CV 2': { x: this.width / 2 + 30, y: this.height, type: 'cv', target: this.filter.frequency, orientation: 'vertical' }
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

        // Dibujar deslizador de Cutoff
        this.drawVerticalSlider(ctx, 'cutoff', 30, 50, 120, 20, 20000, this.filter.frequency.value, 'Hz');

        // Dibujar deslizador de Q
        this.drawVerticalSlider(ctx, 'q', this.width - 30, 50, 120, 0, 30, this.filter.Q.value, '');

        ctx.restore();
        this.drawConnectors(ctx, hoveredConnectorInfo);
    }

    drawVerticalSlider(ctx, paramName, x, y, height, minVal, maxVal, currentValue, unit) {
        const sliderWidth = 10;
        const knobRadius = 8;

        // Etiqueta
        ctx.fillStyle = '#E0E0E0';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(paramName.toUpperCase(), x, y - 5);

        // Barra del slider
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + height);
        ctx.stroke();

        // Pomo del slider
        const normalizedValue = (currentValue - minVal) / (maxVal - minVal);
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
            height: height
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

    handleDragInteraction(dx, dy) {
        if (!this.activeControl) return;

        const sliderHeight = 120; // Altura del deslizador
        const sensitivity = dy * -1; // Invertir dy para que arrastrar hacia arriba aumente el valor

        if (this.activeControl === 'cutoff') {
            const minFreq = 20; // Hz
            const maxFreq = 20000; // Hz
            const currentFreq = this.filter.frequency.value;
            const newFreq = currentFreq + (sensitivity / sliderHeight) * (maxFreq - minFreq);
            this.filter.frequency.setValueAtTime(Math.max(minFreq, Math.min(maxFreq, newFreq)), audioContext.currentTime);
        } else if (this.activeControl === 'q') {
            const minQ = 0.1;
            const maxQ = 30;
            const currentQ = this.filter.Q.value;
            const newQ = currentQ + (sensitivity / sliderHeight) * (maxQ - minQ);
            this.filter.Q.setValueAtTime(Math.max(minQ, Math.min(maxQ, newQ)), audioContext.currentTime);
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