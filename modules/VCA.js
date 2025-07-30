// modules/VCA.js
import { audioContext } from './AudioContext.js';

export class VCA {
    constructor(x, y, id = null, initialState = {}) {
        this.id = id || `vca-${Date.now()}`;
        this.x = x;
        this.y = y;
        this.width = 110;
        this.height = 150; // Aumentar altura
        this.type = 'VCA';

        this.gainNode = audioContext.createGain();
        this.gainNode.gain.value = 0;

        this.inputs = {
            'audio': { x: 0, y: this.height / 2, type: 'audio', target: this.gainNode, orientation: 'horizontal' },
            'CV 1': { x: this.width / 2 - 30, y: this.height, type: 'cv', target: this.gainNode.gain, orientation: 'vertical' },
            'CV 2': { x: this.width / 2 + 30, y: this.height, type: 'cv', target: this.gainNode.gain, orientation: 'vertical' }
        };
        this.outputs = {
            'audio': { x: this.width, y: this.height / 2, type: 'audio', source: this.gainNode, orientation: 'horizontal' }
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
        ctx.fillText('VCA', this.width / 2, 22);

        ctx.beginPath();
        ctx.moveTo(20, this.height - 40);
        ctx.lineTo(this.width / 2, 40);
        ctx.lineTo(this.width - 20, this.height - 40);
        ctx.closePath();
        ctx.stroke();

        ctx.restore();
        this.drawConnectors(ctx, hoveredConnectorInfo);
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
            if (name.startsWith('CV')) {
                ctx.textAlign = 'center';
                ctx.fillText(name, x, y + connectorRadius + 12);
            } else {
                ctx.textAlign = 'left';
                ctx.fillText('AUDIO', x + connectorRadius + 4, y + 4);
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
        this.gainNode.disconnect();
    }

    getState() { return { id: this.id, type: 'VCA', x: this.x, y: this.y }; }

    setState(state) {
        this.id = state.id || this.id;
        this.x = state.x;
        this.y = state.y;
    }
    setState(state) { this.x = state.x; this.y = state.y; }
}