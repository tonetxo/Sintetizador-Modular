// modules/LFO.js
import { audioContext } from './AudioContext.js';

function createNoiseGenerator(audioCtx) {
    const bufferSize = audioCtx.sampleRate * 2; // 2 segundos de ruído
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
    }
    const noiseNode = audioCtx.createBufferSource();
    noiseNode.buffer = buffer;
    noiseNode.loop = true;
    noiseNode.start();
    return noiseNode;
}


export class LFO {
    constructor(x, y, id = null, initialState = {}) {
        this.id = id || `lfo-${Date.now()}`;
        this.x = x;
        this.y = y;
        this.width = 160;
        this.height = 220; // Máis alto
        this.type = 'LFO';

        this.oscillator = audioContext.createOscillator();
        this.oscillator.frequency.setValueAtTime(8, audioContext.currentTime);
        
        this.noise = createNoiseGenerator(audioContext);

        this.depth = audioContext.createGain();
        this.depth.gain.value = 3;

        this.gateGain = audioContext.createGain();
        this.gateGain.gain.value = 1;

        this.outputScaler = audioContext.createGain();
        this.outputScaler.gain.value = 0.04;

        this.oscillator.connect(this.depth);
        this.depth.connect(this.gateGain);
        this.gateGain.connect(this.outputScaler);
        this.oscillator.start();
        
        // Conexión para mantener el procesador activo
        this.keepAliveNode = audioContext.createGain();
        this.keepAliveNode.gain.value = 0;
        this.outputScaler.connect(this.keepAliveNode);
        this.keepAliveNode.connect(audioContext.destination);

        this.activeControl = null;
        this.paramHotspots = {};
        this.waveforms = ['sine', 'square', 'sawtooth', 'triangle', 'pulse', 'noise'];
        this.currentWaveformIndex = 0;
        this.oscillator.type = 'sine';

        this.inputs = {
            'Rate CV': { x: this.width / 2 - 40, y: this.height, type: 'cv', target: this.oscillator.frequency, orientation: 'vertical' },
            'Gate': { x: this.width / 2 + 40, y: this.height, type: 'gate', target: this.gateGain.gain, orientation: 'vertical' }
        };
        this.outputs = {
            'SALIDA': { x: this.width, y: this.height / 2, type: 'cv', source: this.outputScaler, orientation: 'horizontal' }
        };

        // Aplicar estado inicial si existe (para carga de patch)
        if (Object.keys(initialState).length > 0) {
            this.setState(initialState);
        }
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

        // Debuxar valores ao lado do título
        ctx.font = '10px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(`Rate: ${this.oscillator.frequency.value.toFixed(2)}Hz`, 10, 40);
        ctx.textAlign = 'right';
        ctx.fillText(`Depth: ${this.depth.gain.value.toFixed(2)}`, this.width - 10, 40);

        // Debuxar deslizadores con máis percorrido
        const isNoise = this.waveforms[this.currentWaveformIndex] === 'noise';
        ctx.globalAlpha = isNoise ? 0.5 : 1.0;
        this.drawVerticalSlider(ctx, 'rate', 30, 60, 120, 0.01, 20, this.oscillator.frequency.value, false);
        ctx.globalAlpha = 1.0;
        
        this.drawVerticalSlider(ctx, 'depth', this.width - 30, 60, 120, 0.01, 1000, this.depth.gain.value, true);

        // Debuxar selector de forma de onda (con tamaño de VCO)
        ctx.beginPath();
        ctx.arc(this.width / 2, this.height / 2, 25, 0, Math.PI * 2);
        ctx.stroke();
        this.drawWaveform(ctx, this.width / 2, this.height / 2, 18);

        ctx.restore();
        this.drawConnectors(ctx, hoveredConnectorInfo);
    }

    drawVerticalSlider(ctx, paramName, x, y, height, minVal, maxVal, currentValue, isLogarithmic) {
        const knobRadius = 8;

        // Barra
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + height);
        ctx.stroke();

        // Pomo
        let normalizedValue;
        if (isLogarithmic) {
            const logMin = Math.log(minVal);
            const logMax = Math.log(maxVal);
            const logCurrent = Math.log(currentValue);
            normalizedValue = (logCurrent - logMin) / (logMax - logMin);
        } else {
            normalizedValue = (currentValue - minVal) / (maxVal - minVal);
        }
        normalizedValue = Math.max(0, Math.min(1, normalizedValue));
        const knobY = y + height - (normalizedValue * height);

        ctx.beginPath();
        ctx.arc(x, knobY, knobRadius, 0, Math.PI * 2);
        ctx.fillStyle = this.activeControl === paramName ? '#aaffff' : '#4a90e2';
        ctx.fill();
        ctx.strokeStyle = '#E0E0E0';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        this.paramHotspots[paramName] = { x: x - knobRadius, y: y, width: knobRadius * 2, height: height };
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
        } else if (type === 'pulse') { // Mantemos o pulso específico do LFO
            ctx.moveTo(cx - radius, cy + radius / 2);
            ctx.lineTo(cx - radius, cy - radius / 2);
            ctx.lineTo(cx + radius / 2, cy - radius / 2);
            ctx.lineTo(cx + radius / 2, cy + radius / 2);
            ctx.lineTo(cx + radius, cy + radius / 2);
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
            ctx.fillText(name, x, props.orientation === 'vertical' ? y + (props.y > this.height/2 ? connectorRadius + 12 : -connectorRadius - 4) : 0);
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

    setWaveform(waveform) {
        // Disconnect only if connected
        try { this.oscillator.disconnect(this.depth); } catch (e) { /* ignore */ }
        try { this.noise.disconnect(this.depth); } catch (e) { /* ignore */ }

        if (waveform === 'noise') {
            this.noise.connect(this.depth);
        } else if (waveform === 'pulse') {
            this.oscillator.type = 'square'; // Pulse is typically a square wave with variable pulse width
            this.oscillator.connect(this.depth);
        } else {
            this.oscillator.type = waveform;
            this.oscillator.connect(this.depth);
        }
        const wfIndex = this.waveforms.indexOf(waveform);
        if (wfIndex !== -1) {
            this.currentWaveformIndex = wfIndex;
        }
    }

    handleClick(x, y) {
        const localX = x - this.x;
        const localY = y - this.y;
        const symbolX = this.width / 2;
        const symbolY = this.height / 2;
        const dist = Math.sqrt(Math.pow(localX - symbolX, 2) + Math.pow(localY - symbolY, 2));
        
        if (dist < 25) { // Aumentamos o radio de clic para coincidir co novo tamaño
            const newIndex = (this.currentWaveformIndex + 1) % this.waveforms.length;
            this.setWaveform(this.waveforms[newIndex]);
            return true;
        }
        return false;
    }

    checkInteraction(pos) {
        const localPos = { x: pos.x - this.x, y: pos.y - this.y };
        // Comprobar interacción con los deslizadores
        for (const [param, rect] of Object.entries(this.paramHotspots)) {
            if (localPos.x >= rect.x && localPos.x <= rect.x + rect.width &&
                localPos.y >= rect.y && localPos.y <= rect.y + rect.height) {
                this.activeControl = param;
                return true;
            }
        }
        // A lóxica de click para a forma de onda xestiónase en `handleClick`
        return false;
    }

    handleDragInteraction(worldPos) {
        if (!this.activeControl) return;

        const localY = worldPos.y - this.y;
        const sliderRect = this.paramHotspots[this.activeControl];
        
        let normalizedValue = (sliderRect.y + sliderRect.height - localY) / sliderRect.height;
        normalizedValue = Math.max(0, Math.min(1, normalizedValue));

        if (this.activeControl === 'rate') {
            const minRate = 0.01; // Hz
            const maxRate = 20; // Hz
            const newRate = minRate + normalizedValue * (maxRate - minRate);
            this.oscillator.frequency.setValueAtTime(newRate, audioContext.currentTime);
        } else if (this.activeControl === 'depth') {
            const minDepth = 0.01; // Valor mínimo para evitar log(0)
            const maxDepth = 1000; // Valor máximo de profundidad
            const logMin = Math.log(minDepth);
            const logMax = Math.log(maxDepth);
            
            const logNew = logMin + normalizedValue * (logMax - logMin);
            const newDepth = Math.exp(logNew);
            this.depth.gain.setValueAtTime(newDepth, audioContext.currentTime);
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
        this.gateGain.disconnect();
        this.outputScaler.disconnect();
        this.keepAliveNode?.disconnect();
    }

    getState() {
        return {
            id: this.id,
            type: 'LFO',
            x: this.x, y: this.y,
            rate: this.oscillator.frequency.value, // Corregido de this.lfo a this.oscillator
            depth: this.depth.gain.value, // Añadido para guardar el depth
            waveform: this.waveforms[this.currentWaveformIndex]
        };
    }

    setState(state) {
        this.id = state.id || this.id;
        this.x = state.x; this.y = state.y;
        this.oscillator.frequency.setValueAtTime(state.rate, audioContext.currentTime); // Corregido de this.lfo a this.oscillator
        if (state.depth !== undefined) { // Cargar depth si existe
            this.depth.gain.setValueAtTime(state.depth, audioContext.currentTime);
        }
        const wfIndex = this.waveforms.indexOf(state.waveform);
        this.currentWaveformIndex = (wfIndex !== -1) ? wfIndex : 0;
        this.setWaveform(this.waveforms[this.currentWaveformIndex]);
    }
}
