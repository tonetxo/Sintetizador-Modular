// modules/LFO.js
import { audioContext } from './AudioContext.js';

export class LFO {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 120;
        this.height = 140; // Aumentar altura
        this.type = 'LFO';

        this.oscillator = audioContext.createOscillator();
        this.oscillator.frequency.setValueAtTime(5, audioContext.currentTime);
        
        this.depth = audioContext.createGain();
        this.depth.gain.value = 100;

        this.oscillator.connect(this.depth);
        this.oscillator.start();
        
        this.activeControl = null;
        this.paramHotspots = {};
        this.waveforms = ['sine', 'square', 'sawtooth', 'triangle'];
        this.currentWaveformIndex = 0;
        this.oscillator.type = 'sine';

        this.inputs = {
            'Rate CV': { x: this.width / 2, y: this.height, type: 'cv', target: this.oscillator.frequency, orientation: 'vertical' }
        };
        this.outputs = {
            'SALIDA': { x: this.width, y: this.height / 2, type: 'cv', source: this.depth, orientation: 'horizontal' }
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
        ctx.fillText('LFO', this.width / 2, 22);

        this.drawParams(ctx);

        ctx.beginPath();
        ctx.arc(this.width / 2, 95, 20, 0, Math.PI * 2);
        ctx.stroke();
        this.drawWaveform(ctx, this.width / 2, 95, 15);

        ctx.restore();
        this.drawConnectors(ctx, hoveredConnectorInfo);
    }

    drawParams(ctx) {
        ctx.font = '11px Arial';
        ctx.textAlign = 'center';
        
        const rateText = `Rate: ${this.oscillator.frequency.value.toFixed(2)} Hz`;
        ctx.fillStyle = this.activeControl === 'rate' ? '#aaffff' : '#E0E0E0';
        ctx.fillText(rateText, this.width / 2, 42);
        this.paramHotspots['rate'] = { x: this.width/2 - 40, y: 32, width: 80, height: 15 };

        const depthText = `Depth: ${this.depth.gain.value.toFixed(0)}`;
        ctx.fillStyle = this.activeControl === 'depth' ? '#aaffff' : '#E0E0E0';
        ctx.fillText(depthText, this.width / 2, 58);
        this.paramHotspots['depth'] = { x: this.width/2 - 40, y: 48, width: 80, height: 15 };
    }
    
    drawWaveform(ctx, cx, cy, radius) {
        ctx.save();
        ctx.strokeStyle = '#E0E0E0';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const type = this.waveforms[this.currentWaveformIndex];
        if (type === 'sine') {
             ctx.moveTo(cx - radius, cy);
             ctx.quadraticCurveTo(cx - radius/2, cy - radius, cx, cy);
             ctx.quadraticCurveTo(cx + radius/2, cy + radius, cx + radius, cy);
        } else if (type === 'square') {
            ctx.moveTo(cx - radius, cy + radius/2);
            ctx.lineTo(cx - radius, cy - radius/2);
            ctx.lineTo(cx, cy - radius/2);
            ctx.lineTo(cx, cy + radius/2);
            ctx.lineTo(cx + radius, cy + radius/2);
        } else if (type === 'sawtooth') {
            ctx.moveTo(cx - radius, cy + radius);
            ctx.lineTo(cx + radius, cy - radius);
        } else if (type === 'triangle') {
            ctx.moveTo(cx - radius, cy);
            ctx.lineTo(cx, cy - radius);
            ctx.lineTo(cx, cy + radius);
            ctx.lineTo(cx + radius, cy);
        }
        ctx.stroke();
        ctx.restore();
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
            ctx.textAlign = 'center';
            ctx.fillText(name, x, y + connectorRadius + 12);
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
            ctx.textAlign = 'right';
            ctx.fillText(name, x - connectorRadius - 4, y + 4);
        });
    }

    handleClick(x, y) {
        const symbolX = this.x + this.width / 2;
        const symbolY = this.y + 95;
        const dist = Math.sqrt(Math.pow(x - symbolX, 2) + Math.pow(y - symbolY, 2));
        if (dist < 20) {
            this.currentWaveformIndex = (this.currentWaveformIndex + 1) % this.waveforms.length;
            this.oscillator.type = this.waveforms[this.currentWaveformIndex];
            return true;
        }
        return false;
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
        if (this.activeControl === 'rate') {
            const coarse = 0.05;
            const fine = 0.005;
            const amount = sensitivity * (isFine ? fine : coarse);
            const newFreq = this.oscillator.frequency.value + amount;
            this.oscillator.frequency.setTargetAtTime(Math.max(0.01, Math.min(30, newFreq)), audioContext.currentTime, 0.01);
        } else if (this.activeControl === 'depth') {
            const coarse = 1;
            const fine = 0.1;
            const amount = sensitivity * (isFine ? fine : coarse);
            const newDepth = this.depth.gain.value + amount;
            this.depth.gain.setTargetAtTime(Math.max(0, Math.min(5000, newDepth)), audioContext.currentTime, 0.01);
        }
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
        this.oscillator.disconnect();
    }

    getState() {
        return {
            type: 'LFO',
            x: this.x,
            y: this.y,
            rate: this.oscillator.frequency.value,
            depth: this.depth.gain.value,
            waveform: this.waveforms[this.currentWaveformIndex]
        };
    }

    setState(state) {
        this.x = state.x;
        this.y = state.y;
        this.oscillator.frequency.setValueAtTime(state.rate, audioContext.currentTime);
        this.depth.gain.setValueAtTime(state.depth, audioContext.currentTime);
        const wfIndex = this.waveforms.indexOf(state.waveform);
        this.currentWaveformIndex = (wfIndex !== -1) ? wfIndex : 0;
        this.oscillator.type = this.waveforms[this.currentWaveformIndex];
    }
}