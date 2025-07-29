// modules/RingMod.js
import { audioContext } from './AudioContext.js';

export class RingMod {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 120;
        this.height = 120;
        this.type = 'RingMod';

        // Un modulador en anillo es esencialmente un multiplicador de señales.
        // Se implementa usando un GainNode donde la señal moduladora controla la ganancia.
        this.multiplier = audioContext.createGain();

        this.inputs = {
            'Portadora': { x: 0, y: 40, type: 'audio', target: this.multiplier, orientation: 'horizontal' },
            'Moduladora': { x: 0, y: 80, type: 'audio', target: this.multiplier.gain, orientation: 'horizontal' }
        };
        this.outputs = {
            'SALIDA': { x: this.width, y: this.height / 2, type: 'audio', source: this.multiplier, orientation: 'horizontal' }
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
        ctx.font = '11px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Mod. Anillo', this.width / 2, 22);
        
        // Símbolo 'X'
        ctx.strokeStyle = '#E0E0E0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const margin = 35;
        ctx.moveTo(margin, margin);
        ctx.lineTo(this.width - margin, this.height - margin);
        ctx.moveTo(this.width - margin, margin);
        ctx.lineTo(margin, this.height - margin);
        ctx.stroke();

        ctx.restore();
        this.drawConnectors(ctx, hoveredConnectorInfo);
    }

    drawConnectors(ctx, hovered) {
        const isHovered = (type, name) => hovered && hovered.module === this && hovered.connector.type === type && hovered.connector.name === name;
        const connectorRadius = 8;
        ctx.font = '10px Arial';
        ctx.fillStyle = '#E0E0E0';
        ctx.textAlign = 'left';

        Object.entries(this.inputs).forEach(([name, props]) => {
            const x = this.x + props.x;
            const y = this.y + props.y;
            ctx.beginPath();
            ctx.arc(x, y, connectorRadius, 0, Math.PI * 2);
            ctx.fillStyle = isHovered('input', name) ? 'white' : '#4a90e2';
            ctx.fill();
            ctx.fillStyle = '#E0E0E0';
            ctx.fillText(name, x + connectorRadius + 4, y + 4);
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
            ctx.fillText(name, x - connectorRadius - 4, y + 4);
        });
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
        this.multiplier.disconnect();
    }

    getState() { return { type: 'RingMod', x: this.x, y: this.y }; }
    setState(state) { this.x = state.x; this.y = state.y; }
}