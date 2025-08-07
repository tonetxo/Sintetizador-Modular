// modules/BaseEffect.js
import { audioContext } from './AudioContext.js';

export class BaseEffect {
    constructor(x, y, type, width, height, id, initialState) {
        this.id = id || `${type.toLowerCase()}-${Date.now()}`;
        this.type = type;
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.processorName = '';
        this.knobDefs = [];
        this.extraHotspots = {};
        
        this.knobHotspots = {};
        this.dragStart = null;
        
        // --- CAMBIO: Almacén local para los valores de los parámetros ---
        this.paramValues = {};

        this.workletNode = null;
        this.inputs = {};
        this.outputs = {};
        this.activeControl = null;
        this.isBypassed = initialState.isBypassed || false;
        this.initialState = initialState;
    }

    async init() {
        try {
            this.workletNode = new AudioWorkletNode(audioContext, this.processorName);

            // --- CAMBIO: Inicializar el almacén local de valores ---
            this.knobDefs.forEach(def => {
                const param = this.workletNode.parameters.get(def.name);
                if (param) {
                    const initialValue = this.initialState[def.name] !== undefined ? this.initialState[def.name] : def.initial;
                    param.value = initialValue;
                    this.paramValues[def.name] = initialValue; // Guardar valor inicial
                }
            });

            this.bypassNode = audioContext.createGain();
            this.bypassNode.gain.value = this.isBypassed ? 0 : 1;

            const inputGain = audioContext.createGain();
            inputGain.connect(this.workletNode);
            this.workletNode.connect(this.bypassNode);

            this.inputs = { 'Entrada': { x: 0, y: this.height / 2, type: 'audio', target: inputGain, orientation: 'horizontal' } };
            this.outputs = { 'Salida': { x: this.width, y: this.height / 2, type: 'audio', source: this.bypassNode, orientation: 'horizontal' } };
        } catch (e) {
            console.error(`[${this.type}-${this.id}] Error initializing worklet:`, e);
        }
    }

    draw(ctx, isSelected, hoveredConnectorInfo) {
        ctx.save();
        ctx.translate(this.x, this.y);

        ctx.fillStyle = this.isBypassed ? '#3a3a3a' : '#222';
        ctx.strokeStyle = isSelected ? '#aaffff' : '#E0E0E0';
        ctx.lineWidth = 2;
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.strokeRect(0, 0, this.width, this.height);

        ctx.fillStyle = '#E0E0E0';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.type.toUpperCase(), this.width / 2, 22);

        if (!this.workletNode) {
            ctx.fillStyle = 'red';
            ctx.fillText('ERROR', this.width / 2, this.height / 2);
        } else if (this.isBypassed) {
            ctx.fillStyle = '#aaa';
            ctx.fillText('BYPASSED', this.width / 2, this.height / 2);
        } else {
            this.drawKnobs(ctx);
        }
        
        this.drawConnectors(ctx, hoveredConnectorInfo);
        ctx.restore();
    }

    drawKnobs(ctx) {
        const numKnobs = this.knobDefs.length;
        const knobsPerRow = 2;
        const rowHeight = 70;
        this.knobDefs.forEach((def, i) => {
            const row = Math.floor(i / knobsPerRow);
            const col = i % knobsPerRow;
            const x = (this.width / (knobsPerRow + 1)) * (col + 1);
            const y = 60 + row * rowHeight;
            
            // --- CAMBIO: Leer el valor del almacén local para dibujar ---
            const value = this.paramValues[def.name];
            if (value !== undefined) {
                this.drawKnob(ctx, def.name, def.label, x, y, def.min, def.max, value, def.logarithmic);
            }
        });
    }

    drawKnob(ctx, paramName, label, x, y, min, max, value, isLogarithmic) {
        const knobRadius = 20;
        const angleRange = Math.PI * 1.5;
        const startAngle = Math.PI * 0.75;
        
        let normalizedValue;
        if (isLogarithmic) {
            const logMin = Math.log(min);
            const logMax = Math.log(max);
            const logValue = Math.log(Math.max(min, value));
            normalizedValue = (logValue - logMin) / (logMax - logMin);
        } else {
            normalizedValue = (value - min) / (max - min);
        }
        normalizedValue = Math.max(0, Math.min(1, normalizedValue));
        const angle = startAngle + normalizedValue * angleRange;

        ctx.font = '10px Arial';
        ctx.fillStyle = '#E0E0E0';
        ctx.textAlign = 'center';
        ctx.fillText(label, x, y - knobRadius - 5);
        ctx.fillText(value.toFixed(2), x, y + knobRadius + 12);

        ctx.strokeStyle = '#555';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, knobRadius, startAngle, startAngle + angleRange);
        ctx.stroke();

        ctx.strokeStyle = this.activeControl === paramName ? '#aaffff' : '#4a90e2';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(angle) * knobRadius, y + Math.sin(angle) * knobRadius);
        ctx.stroke();

        this.knobHotspots[paramName] = { x: x - knobRadius, y: y - knobRadius, width: knobRadius * 2, height: knobRadius * 2 };
    }

    drawConnectors(ctx, hovered) {
        const connectorRadius = 8;
        ctx.font = '10px Arial';
        ctx.fillStyle = '#E0E0E0';

        Object.entries(this.inputs).forEach(([name, props]) => {
            const isHovered = hovered?.module === this && hovered?.connector.name === name;
            const ix = props.x, iy = props.y;
            ctx.beginPath();
            ctx.arc(ix, iy, connectorRadius, 0, Math.PI * 2);
            ctx.fillStyle = isHovered ? 'white' : '#4a90e2';
            ctx.fill();
            ctx.textAlign = 'left';
            ctx.fillText(name, ix + connectorRadius + 4, iy + 4);
        });

        Object.entries(this.outputs).forEach(([name, props]) => {
            const isHovered = hovered?.module === this && hovered?.connector.name === name;
            const ox = props.x, oy = props.y;
            ctx.beginPath();
            ctx.arc(ox, oy, connectorRadius, 0, Math.PI * 2);
            ctx.fillStyle = isHovered ? 'white' : '#222';
            ctx.fill();
            ctx.strokeStyle = '#4a90e2';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.fillStyle = '#E0E0E0';
            ctx.textAlign = 'right';
            ctx.fillText(name.toUpperCase(), ox - connectorRadius - 4, oy + 4);
        });
    }

    handleClick(x, y) {
        const localPos = { x: x - this.x, y: y - this.y };
        for (const [name, spot] of Object.entries(this.extraHotspots)) {
            if (this.isInside(localPos, spot)) {
                spot.callback();
                return true;
            }
        }
        return false;
    }

    checkInteraction(pos) {
        if (this.isBypassed) return false;
        const localPos = { x: pos.x - this.x, y: pos.y - this.y };
        
        for (const def of this.knobDefs) {
            const hotspot = this.knobHotspots[def.name];
            if (hotspot && this.isInside(localPos, hotspot)) {
                this.activeControl = def.name;
                const param = this.workletNode.parameters.get(def.name);
                param.cancelScheduledValues(audioContext.currentTime);
                // --- CAMBIO: Leer el valor del almacén local al iniciar el arrastre ---
                this.dragStart = { y: pos.y, value: this.paramValues[def.name] };
                return true;
            }
        }
        return false;
    }

    handleDragInteraction(worldPos) {
        if (!this.activeControl || !this.workletNode || !this.dragStart) return;
        
        const def = this.knobDefs.find(d => d.name === this.activeControl);
        if (!def) return;

        const dy = this.dragStart.y - worldPos.y;
        const sensitivity = 128;
        
        let newValue;
        if (def.logarithmic) {
            const logMin = Math.log(def.min);
            const logMax = Math.log(def.max);
            const logRange = logMax - logMin;
            const startValue = Math.max(def.min, this.dragStart.value);
            const logValue = Math.log(startValue);
            newValue = Math.exp(logValue + (dy / sensitivity) * logRange);
        } else {
            const range = def.max - def.min;
            newValue = this.dragStart.value + (dy / sensitivity) * range;
        }
        
        newValue = Math.max(def.min, Math.min(def.max, newValue));
        
        // --- CAMBIO: Actualizar el valor local Y el parámetro de audio ---
        this.paramValues[this.activeControl] = newValue; // Para la UI
        const param = this.workletNode.parameters.get(def.name);
        param.setTargetAtTime(newValue, audioContext.currentTime, 0.01); // Para el sonido
    }
    
    endInteraction() {
        this.activeControl = null;
        this.dragStart = null;
    }

    isInside(pos, rect) {
        return pos.x >= rect.x && pos.x <= rect.x + rect.width &&
               pos.y >= rect.y && pos.y <= rect.y + rect.height;
    }

    getConnectorAt(x, y) {
        const localX = x - this.x, localY = y - this.y;
        for (const [name, props] of Object.entries(this.inputs)) {
            if (Math.hypot(localX - props.x, localY - props.y) < 9) return { name, type: 'input', props, module: this };
        }
        for (const [name, props] of Object.entries(this.outputs)) {
            if (Math.hypot(localX - props.x, localY - props.y) < 9) return { name, type: 'output', props, module: this };
        }
        return null;
    }

    getState() {
        if (!this.workletNode) return { id: this.id, type: this.type, x: this.x, y: this.y, error: true };
        const state = {
            id: this.id, type: this.type, x: this.x, y: this.y, isBypassed: this.isBypassed
        };
        // --- CAMBIO: Guardar el estado desde el almacén local ---
        this.knobDefs.forEach(def => {
            state[def.name] = this.paramValues[def.name];
        });
        return state;
    }

    setState(state) {
        if (!this.workletNode || !state) return;
        this.id = state.id || this.id;
        this.x = state.x;
        this.y = state.y;
        this.isBypassed = state.isBypassed || false;
        this.bypassNode.gain.value = this.isBypassed ? 0 : 1;

        // --- CAMBIO: Restaurar el estado en el almacén local y en el parámetro ---
        this.knobDefs.forEach(def => {
            if (state[def.name] !== undefined) {
                const value = state[def.name];
                this.workletNode.parameters.get(def.name).value = value;
                this.paramValues[def.name] = value;
            }
        });
    }

    toggleBypass() {
        if (!this.bypassNode) return;
        this.isBypassed = !this.isBypassed;
        this.bypassNode.gain.setTargetAtTime(this.isBypassed ? 0 : 1, audioContext.currentTime, 0.01);
    }

    disconnect() {
        if (this.workletNode) {
            this.workletNode.disconnect();
            this.workletNode.port.close();
        }
        if (this.bypassNode) this.bypassNode.disconnect();
    }
}