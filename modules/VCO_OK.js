// modules/VCO.js
import { audioContext } from './AudioContext.js';

export class VCO {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 120;
        this.height = 140; // Aumentar altura
        this.type = 'VCO';

        this.oscillator = audioContext.createOscillator();
        this.oscillator.frequency.setValueAtTime(0, audioContext.currentTime);
        this.oscillator.start();

        const bufferSize = audioContext.sampleRate * 2;
        const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
        const output = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }
        this.noise = audioContext.createBufferSource();
        this.noise.buffer = buffer;
        this.noise.loop = true;
        this.noise.start();
        
        this.output = audioContext.createGain();
        this.activeSource = this.oscillator;
        this.activeSource.connect(this.output);

        this.inputs = {
            '1V/Oct': { x: this.width / 2 - 30, y: this.height, type: 'cv', target: this.oscillator.frequency, orientation: 'vertical' },
            'FM': { x: this.width / 2 + 30, y: this.height, type: 'cv', target: this.oscillator.frequency, orientation: 'vertical' }
        };
        this.outputs = {
            'audio': { x: this.width, y: this.height / 2, type: 'audio', source: this.output, orientation: 'horizontal' }
        };
        
        this.waveforms = ['sawtooth', 'square', 'sine', 'triangle', 'noise'];
        this.currentWaveformIndex = 0;
        this.setWaveform(this.waveforms[this.currentWaveformIndex]);
    }

    setWaveform() {
        this.activeSource.disconnect(this.output);
        const waveformName = this.waveforms[this.currentWaveformIndex];

        if (waveformName === 'noise') {
            this.activeSource = this.noise;
        } else {
            this.activeSource = this.oscillator;
            this.oscillator.type = waveformName;
        }
        this.activeSource.connect(this.output);
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
        ctx.fillText('VCO', this.width / 2, 22);

        ctx.beginPath();
        ctx.arc(this.width / 2, 75, 25, 0, Math.PI * 2);
        ctx.stroke();
        this.drawWaveform(ctx, this.width / 2, 75, 18);

        ctx.restore();
        this.drawConnectors(ctx, hoveredConnectorInfo);
    }
    
    drawWaveform(ctx, cx, cy, radius) {
        ctx.save();
        ctx.strokeStyle = '#E0E0E0';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const type = this.waveforms[this.currentWaveformIndex];
        if (type === 'noise') {
            ctx.font = 'bold 30px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('*', cx, cy);
        } else if (type === 'sawtooth') {
            ctx.moveTo(cx - radius, cy + radius/2);
            ctx.lineTo(cx, cy - radius);
            ctx.lineTo(cx, cy + radius);
            ctx.lineTo(cx + radius, cy - radius/2);
        } else if (type === 'square') {
            ctx.moveTo(cx - radius, cy + radius/2);
            ctx.lineTo(cx - radius, cy - radius/2);
            ctx.lineTo(cx, cy - radius/2);
            ctx.lineTo(cx, cy + radius/2);
            ctx.lineTo(cx + radius, cy + radius/2);
        } else if (type === 'sine') {
             ctx.moveTo(cx - radius, cy);
             ctx.quadraticCurveTo(cx - radius/2, cy - radius, cx, cy);
             ctx.quadraticCurveTo(cx + radius/2, cy + radius, cx + radius, cy);
        } else if (type === 'triangle') {
            ctx.moveTo(cx - radius, cy + radius/2);
            ctx.lineTo(cx - radius/2, cy - radius/2);
            ctx.lineTo(cx + radius/2, cy + radius/2);
            ctx.lineTo(cx + radius, cy - radius/2);
        }
        ctx.stroke();
        ctx.restore();
    }

    drawConnectors(ctx, hovered) {
        const isHovered = (type, name) => hovered && hovered.module === this && hovered.connector.type === type && hovered.connector.name === name;
        const connectorRadius = 8;
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#E0E0E0';

        Object.entries(this.inputs).forEach(([name, props]) => {
            const x = this.x + props.x;
            const y = this.y + props.y;
            ctx.beginPath();
            ctx.arc(x, y, connectorRadius, 0, Math.PI * 2);
            ctx.fillStyle = isHovered('input', name) ? 'white' : '#4a90e2';
            ctx.fill();
            ctx.fillStyle = '#E0E0E0';
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
            ctx.fillStyle = '#E0E0E0';
            ctx.textAlign = 'right';
            ctx.fillText('SALIDA', x - connectorRadius - 4, y + 4);
        });
    }

    handleClick(x, y) {
        const symbolX = this.x + this.width / 2;
        const symbolY = this.y + 75;
        const dist = Math.sqrt(Math.pow(x - symbolX, 2) + Math.pow(y - symbolY, 2));
        if (dist < 25) {
            this.currentWaveformIndex = (this.currentWaveformIndex + 1) % this.waveforms.length;
            this.setWaveform(this.waveforms[this.currentWaveformIndex]);
            return true;
        }
        return false;
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
        this.oscillator.disconnect();
        this.noise.disconnect();
        this.output.disconnect();
    }
    
    getState() {
        return {
            type: 'VCO',
            x: this.x,
            y: this.y,
            waveform: this.waveforms[this.currentWaveformIndex]
        };
    }

    setState(state) {
        this.x = state.x;
        this.y = state.y;
        const wfIndex = this.waveforms.indexOf(state.waveform);
        this.currentWaveformIndex = (wfIndex !== -1) ? wfIndex : 0;
        this.setWaveform(this.waveforms[this.currentWaveformIndex]);
    }
}