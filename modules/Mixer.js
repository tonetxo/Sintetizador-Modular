// modules/Mixer.js
import { audioContext } from './AudioContext.js';

export class Mixer {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 120;
        this.height = 160;
        this.type = 'Mixer';

        this.outputNode = audioContext.createGain();
        this.channels = [];
        this.inputs = {};
        
        for (let i = 0; i < 4; i++) {
            const channelGain = audioContext.createGain();
            channelGain.gain.value = i === 0 ? 1 : 0; // Primer canal abierto por defecto
            channelGain.connect(this.outputNode);
            this.channels.push(channelGain);
            
            this.inputs[`In ${i + 1}`] = { 
                x: 0, 
                y: 35 + i * 30, 
                type: 'audio', 
                target: channelGain, 
                orientation: 'horizontal' 
            };
        }

        this.outputs = {
            'Out': { x: this.width, y: this.height / 2, type: 'audio', source: this.outputNode, orientation: 'horizontal' }
        };

        this.activeControl = null;
        this.paramHotspots = {};
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
        ctx.fillText('MIXER', this.width / 2, 20);

        this.drawParams(ctx);

        ctx.restore();
        this.drawConnectors(ctx, hoveredConnectorInfo);
    }

    drawParams(ctx) {
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';

        for (let i = 0; i < 4; i++) {
            const yPos = 35 + i * 30;
            const level = this.channels[i].gain.value;
            const text = `Lvl: ${level.toFixed(2)}`;
            
            ctx.fillStyle = this.activeControl === i ? '#aaffff' : '#E0E0E0';
            ctx.fillText(text, this.width / 2 + 10, yPos + 4);

            this.paramHotspots[i] = { x: this.width / 2 - 20, y: yPos - 8, width: 60, height: 16 };
        }
    }

    drawConnectors(ctx, hovered) {
        const isHovered = (type, name) => hovered && hovered.module === this && hovered.connector.type === type && hovered.connector.name === name;
        const connectorRadius = 8;
        ctx.font = '10px Arial';

        Object.entries(this.inputs).forEach(([name, props]) => {
            const x = this.x + props.x;
            const y = this.y + props.y;
            ctx.beginPath();
            ctx.arc(x, y, connectorRadius, 0, Math.PI * 2);
            ctx.fillStyle = isHovered('input', name) ? 'white' : '#4a90e2';
            ctx.fill();
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
        });
    }

    checkInteraction(pos) {
        for (const [param, rect] of Object.entries(this.paramHotspots)) {
            const worldRect = { x: this.x + rect.x, y: this.y + rect.y, width: rect.width, height: rect.height };
            if (pos.x >= worldRect.x && pos.x <= worldRect.x + worldRect.width &&
                pos.y >= worldRect.y && pos.y <= worldRect.y + worldRect.height) {
                this.activeControl = parseInt(param);
                return true;
            }
        }
        return false;
    }

    handleDragInteraction(dx, dy, isFine) {
        if (this.activeControl === null) return;
        const coarse = 0.01;
        const fine = 0.001;
        const sensitivity = -dy * (isFine ? fine : coarse);
        const channel = this.channels[this.activeControl];
        const newGain = channel.gain.value + sensitivity;
        channel.gain.value = Math.max(0, Math.min(2, newGain)); // Limitar entre 0 y 2
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
        this.outputNode.disconnect();
        this.channels.forEach(ch => ch.disconnect());
    }

    getState() {
        return {
            type: 'Mixer',
            x: this.x,
            y: this.y,
            levels: this.channels.map(ch => ch.gain.value)
        };
    }

    setState(state) {
        this.x = state.x;
        this.y = state.y;
        state.levels.forEach((level, i) => {
            if (this.channels[i]) {
                this.channels[i].gain.value = level;
            }
        });
    }
}