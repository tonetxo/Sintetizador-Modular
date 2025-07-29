// modules/ADSR.js
import { audioContext } from './AudioContext.js';

export class ADSR {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 180;
        this.height = 120;
        this.type = 'ADSR';

        this.params = { attack: 0.1, decay: 0.2, sustain: 0.6, release: 0.5 };
        
        this.outputNode = audioContext.createGain();
        this.outputNode.gain.value = 0;
        
        const constantSource = audioContext.createConstantSource();
        constantSource.offset.value = 1;
        constantSource.start();
        constantSource.connect(this.outputNode);

        this.inputs = { 'Disparo': { x: 0, y: this.height / 2, type: 'gate', orientation: 'horizontal' } };
        this.outputs = { 'C.V.': { x: this.width, y: this.height / 2, type: 'cv', source: this.outputNode, orientation: 'horizontal' } };

        // --- Propiedades para el control gráfico ---
        this.controlPoints = { a: {}, d: {}, r: {} };
        this.draggingPoint = null;
        this.controlPointRadius = 5;
        this.editorBox = { x: 15, y: 35, w: this.width - 30, h: this.height - 55 };
        
        // Inicializar las posiciones de los puntos a partir de los parámetros
        this.updateControlPointsFromParams();
    }
    
    updateControlPointsFromParams() {
        const box = this.editorBox;
        const maxTime = 2.0; // Tiempo máximo visual para A+D+R

        const attackX = box.x + (this.params.attack / maxTime) * box.w;
        const decayX = attackX + (this.params.decay / maxTime) * box.w;
        const releaseX = decayX + (this.params.release / maxTime) * box.w;
        const sustainY = box.y + box.h * (1 - this.params.sustain);

        this.controlPoints.a = { x: Math.min(attackX, box.x + box.w), y: box.y };
        this.controlPoints.d = { x: Math.min(decayX, box.x + box.w), y: sustainY };
        this.controlPoints.r = { x: Math.min(releaseX, box.x + box.w), y: box.y + box.h };
    }

    updateParamsFromControlPoints() {
        const box = this.editorBox;
        const maxTime = 2.0; // Tiempo máximo que puede representar el ancho total

        const attackRatio = (this.controlPoints.a.x - box.x) / box.w;
        const decayRatio = (this.controlPoints.d.x - this.controlPoints.a.x) / box.w;
        const releaseRatio = (this.controlPoints.r.x - this.controlPoints.d.x) / box.w;

        this.params.attack = Math.max(0.01, attackRatio * maxTime);
        this.params.decay = Math.max(0.01, decayRatio * maxTime);
        this.params.release = Math.max(0.01, releaseRatio * maxTime);
        this.params.sustain = Math.max(0, 1 - (this.controlPoints.d.y - box.y) / box.h);
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

        this.drawEnvelopeEditor(ctx);
        
        ctx.restore();
        this.drawConnectors(ctx, hoveredConnectorInfo);
    }
    
    drawEnvelopeEditor(ctx) {
        const box = this.editorBox;

        // La curva se dibuja directamente desde las posiciones guardadas
        ctx.strokeStyle = '#aaffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(box.x, box.y + box.h); // Start
        ctx.lineTo(this.controlPoints.a.x, this.controlPoints.a.y); // Attack
        ctx.lineTo(this.controlPoints.d.x, this.controlPoints.d.y); // Decay
        ctx.lineTo(this.controlPoints.r.x, this.controlPoints.r.y); // Release
        ctx.stroke();

        // Dibujar los puntos de control
        ctx.fillStyle = '#f0a048';
        Object.values(this.controlPoints).forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, this.controlPointRadius, 0, 2 * Math.PI);
            ctx.fill();
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
        const localPos = { x: pos.x - this.x, y: pos.y - this.y };
        for (const [name, p] of Object.entries(this.controlPoints)) {
            const dist = Math.sqrt(Math.pow(localPos.x - p.x, 2) + Math.pow(localPos.y - p.y, 2));
            if (dist < this.controlPointRadius + 4) {
                this.draggingPoint = name;
                return true;
            }
        }
        return false;
    }

    handleDragInteraction(dx, dy) {
        if (!this.draggingPoint) return;

        const box = this.editorBox;
        const point = this.controlPoints[this.draggingPoint];
        point.x += dx;
        point.y += dy;

        // Limitar el movimiento de los puntos al interior de la caja
        point.x = Math.max(box.x, Math.min(point.x, box.x + box.w));
        point.y = Math.max(box.y, Math.min(point.y, box.y + box.h));

        // Forzar puntos A y R a los bordes superior/inferior
        if (this.draggingPoint === 'a') point.y = box.y;
        if (this.draggingPoint === 'r') point.y = box.y + box.h;

        // Evitar que los puntos se crucen en el eje X
        if (this.draggingPoint === 'a') {
            point.x = Math.min(point.x, this.controlPoints.d.x - 1);
        } else if (this.draggingPoint === 'd') {
            point.x = Math.max(point.x, this.controlPoints.a.x + 1);
            point.x = Math.min(point.x, this.controlPoints.r.x - 1);
        } else if (this.draggingPoint === 'r') {
            point.x = Math.max(point.x, this.controlPoints.d.x + 1);
        }

        this.updateParamsFromControlPoints();
    }

    endInteraction() {
        this.draggingPoint = null;
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
        this.updateControlPointsFromParams();
    }
}