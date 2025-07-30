// modules/VCF.js
import { audioContext } from './AudioContext.js';

export class VCF {
    constructor(x, y, id = null, initialState = {}) {
        this.id = id || `vcf-${Date.now()}`;
        this.x = x;
        this.y = y;
        this.width = 130;
        this.height = 160;
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

        this.drawParams(ctx);
        
        ctx.strokeStyle = '#E0E0E0';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(30, 80);
        ctx.lineTo(this.width - 30, 80);
        ctx.lineTo(this.width - 30, this.height - 50);
        ctx.closePath();
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(30, 90);
        ctx.lineTo(this.width - 40, this.height - 55);
        ctx.stroke();

        ctx.restore();
        this.drawConnectors(ctx, hoveredConnectorInfo);
    }

    drawParams(ctx) {
        ctx.fillStyle = '#E0E0E0';
        ctx.font = '11px Arial';
        ctx.textAlign = 'center';

        const qText = `Q: ${this.filter.Q.value.toFixed(1)}`;
        ctx.fillStyle = this.activeControl === 'q' ? '#aaffff' : '#E0E0E0';
        ctx.fillText(qText, this.width / 2, 22);
        this.paramHotspots['q'] = { x: this.width/2 - 20, y: 12, width: 40, height: 15 };

        const cutoffText = `Cutoff: ${this.filter.frequency.value.toFixed(0)}Hz`;
        ctx.fillStyle = this.activeControl === 'cutoff' ? '#aaffff' : '#E0E0E0';
        ctx.fillText(cutoffText, this.width / 2, 42);
        this.paramHotspots['cutoff'] = { x: this.width/2 - 40, y: 32, width: 80, height: 15 };
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
        for (const [param, rect] of Object.entries(this.paramHotspots)) {
            const worldRect = { x: this.x + rect.x, y: this.y + rect.y, width: rect.width, height: rect.height };
            if (pos.x >= worldRect.x && pos.x <= worldRect.x + worldRect.width &&
                pos.y >= worldRect.y && pos.y <= worldRect.y + worldRect.height) {
                this.activeControl = param;
                return true;
            }
        }
        return false;
    }

    handleDragInteraction(dx, dy, isFine) {
        if (!this.activeControl) return;
        const sensitivity = dy * -1;
        if (this.activeControl === 'cutoff') {
            const coarse = 10;
            const fine = 1;
            const amount = sensitivity * (isFine ? fine : coarse);
            const newFreq = this.filter.frequency.value + amount;
            this.filter.frequency.setTargetAtTime(Math.max(20, Math.min(20000, newFreq)), audioContext.currentTime, 0.01);
        } else if (this.activeControl === 'q') {
            const coarse = 0.1;
            const fine = 0.01;
            const amount = sensitivity * (isFine ? fine : coarse);
            const newQ = this.filter.Q.value + amount;
            this.filter.Q.setTargetAtTime(Math.max(0, Math.min(30, newQ)), audioContext.currentTime, 0.01);
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
        this.filter.frequency.value = state.cutoff;
        this.filter.Q.value = state.resonance;
        this.filter.type = state.filterType;
        this.cutoffKnob.value = state.cutoff;
        this.resKnob.value = state.resonance;
        const typeIndex = this.filterTypes.indexOf(state.filterType);
        this.currentFilterTypeIndex = typeIndex !== -1 ? typeIndex : 0;
    }
}