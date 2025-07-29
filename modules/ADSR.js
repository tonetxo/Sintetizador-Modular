// modules/ADSR.js
import { audioContext } from './AudioContext.js';

export class ADSR {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 180;
        this.height = 120;
        this.type = 'ADSR';

        this.params = { attack: 0.05, decay: 0.1, sustain: 0.6, release: 0.5 };
        this.activeControl = null;
        this.paramHotspots = {};

        this.outputNode = audioContext.createGain();
        this.outputNode.gain.value = 0;
        
        const constantSource = audioContext.createConstantSource();
        constantSource.offset.value = 1;
        constantSource.start();
        constantSource.connect(this.outputNode);

        this.inputs = { 'Disparo': { x: 0, y: this.height / 2, type: 'gate', orientation: 'horizontal' } };
        this.outputs = { 'C.V.': { x: this.width, y: this.height / 2, type: 'cv', source: this.outputNode, orientation: 'horizontal' } };
    }
    
    trigger() {
        const now = audioContext.currentTime;
        const gain = this.outputNode.gain;
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(gain.value, now); 
        gain.linearRampToValueAtTime(1.0, now + this.params.attack);
        gain.linearRampToValueAtTime(this.params.sustain, now + this.params.attack + this.params.decay);
    }
    
    gateOff() {
        const now = audioContext.currentTime;
        const gain = this.outputNode.gain;
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(gain.value, now);
        gain.linearRampToValueAtTime(0, now + this.params.release);
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

        this.drawEnvelopeShape(ctx);
        this.drawParams(ctx);
        
        ctx.restore();
        this.drawConnectors(ctx, hoveredConnectorInfo);
    }
    
    drawEnvelopeShape(ctx) {
        ctx.strokeStyle = '#E0E0E0';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const box = { x: 20, y: 35, w: this.width - 40, h: 45 };
        const startX = box.x;
        const startY = box.y + box.h;
        const peakY = box.y;
        const sustainY = box.y + box.h * (1 - this.params.sustain);
        
        const totalTime = this.params.attack + this.params.decay + 0.2 + this.params.release;
        const attackWidth = (this.params.attack / totalTime) * box.w;
        const decayWidth = (this.params.decay / totalTime) * box.w;
        const releaseWidth = (this.params.release / totalTime) * box.w;
        const sustainWidth = box.w - (attackWidth + decayWidth + releaseWidth);

        ctx.moveTo(startX, startY);
        ctx.lineTo(startX + attackWidth, peakY);
        ctx.lineTo(startX + attackWidth + decayWidth, sustainY);
        if (sustainWidth > 0) ctx.lineTo(startX + attackWidth + decayWidth + sustainWidth, sustainY);
        ctx.lineTo(box.x + box.w, startY);
        ctx.stroke();
    }

    drawParams(ctx) {
        ctx.font = '11px Arial';
        let currentX = 15;
        const paramY = this.height - 10;

        Object.keys(this.params).forEach(p => {
            ctx.textAlign = 'left';
            const label = `${p.charAt(0).toUpperCase()}:`;
            const value = this.params[p].toFixed(2);
            const segment = `${label}${value} `;
            const segmentWidth = ctx.measureText(segment).width;

            ctx.fillStyle = (this.activeControl === p) ? '#aaffff' : '#E0E0E0';
            ctx.fillText(segment, currentX, paramY);
            
            this.paramHotspots[p] = { x: currentX, y: paramY - 10, width: segmentWidth, height: 12 };
            currentX += segmentWidth + 5;
        });
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
            ctx.textAlign = 'left';
            ctx.fillText('DISPARO', x + connectorRadius + 4, y + 4);
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
        const coarse = 0.005;
        const fine = 0.0005;
        const sensitivity = -dy * (isFine ? fine : coarse);
        
        switch(this.activeControl) {
            case 'attack': case 'decay': case 'release':
                this.params[this.activeControl] = Math.max(0.01, this.params[this.activeControl] + sensitivity);
                break;
            case 'sustain':
                this.params.sustain = Math.max(0, Math.min(1, this.params.sustain + sensitivity));
                break;
        }
    }

    endInteraction() { this.activeControl = null; }

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
    
    disconnect() { this.outputNode.disconnect(); }

    getState() {
        return {
            type: 'ADSR',
            x: this.x, y: this.y,
            params: { ...this.params }
        };
    }

    setState(state) {
        this.x = state.x; this.y = state.y;
        this.params = { ...state.params };
    }
}