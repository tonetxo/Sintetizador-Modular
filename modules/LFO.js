// modules/LFO.js
import { audioContext } from './AudioContext.js';

function createNoiseGenerator(audioCtx) {
    const bufferSize = audioCtx.sampleRate * 2;
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
        this.height = 260;
        this.type = 'LFO';

        this.oscillator = audioContext.createOscillator();
        this.oscillator.frequency.setValueAtTime(8, audioContext.currentTime);
        
        this.noise = createNoiseGenerator(audioContext);

        this.depth = audioContext.createGain();
        this.depth.gain.value = 3;

        // --- Lógica de Gate/Ataque que funciona ---
        this.dcOffset = audioContext.createConstantSource();
        this.dcOffset.offset.value = 1.0;
        this.dcOffset.start();

        this.gateReceiver = audioContext.createGain();
        this.gateReceiver.gain.value = 0;

        this.gateSmoother = audioContext.createBiquadFilter();
        this.gateSmoother.type = 'lowpass';
        this.gateSmoother.frequency.value = 1000;

        this.gateGain = audioContext.createGain();
        this.gateGain.gain.value = 0;

        this.dcOffset.connect(this.gateReceiver);
        this.gateReceiver.connect(this.gateSmoother);
        this.gateSmoother.connect(this.gateGain.gain);

        this.outputScaler = audioContext.createGain();
        this.outputScaler.gain.value = 0.04;

        this.isBypassed = initialState.isBypassed || false;
        this.bypassNode = audioContext.createGain();
        this.bypassNode.gain.value = this.isBypassed ? 0 : 1;

        this.oscillator.connect(this.depth);
        this.depth.connect(this.gateGain);
        this.gateGain.connect(this.outputScaler);
        this.outputScaler.connect(this.bypassNode);
        
        this.oscillator.start();
        
        this.activeControl = null;
        this.paramHotspots = {};
        this.waveforms = ['sine', 'square', 'sawtooth', 'triangle', 'pulse', 'noise'];
        this.currentWaveformIndex = 0;
        this.oscillator.type = 'sine';

        this.inputs = {
            'Rate CV': { x: this.width / 2 - 40, y: this.height, type: 'cv', target: this.oscillator.frequency, orientation: 'vertical' },
            'Gate': { x: this.width / 2 + 40, y: this.height, type: 'gate', target: this.gateReceiver.gain, orientation: 'vertical' }
        };
        this.outputs = {
            'SALIDA': { x: this.width, y: this.height / 2, type: 'cv', source: this.bypassNode, orientation: 'horizontal' }
        };

        if (Object.keys(initialState).length > 0) {
            this.setState(initialState);
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
        ctx.fillText('LFO', this.width / 2, 22);
        
        if (this.isBypassed) {
            ctx.font = 'bold 16px Arial';
            ctx.fillStyle = '#aaa';
            ctx.fillText('BYPASSED', this.width / 2, this.height / 2);
        } else {
            ctx.font = '10px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(`Rate: ${this.oscillator.frequency.value.toFixed(2)}Hz`, 10, 40);
            ctx.textAlign = 'right';
            ctx.fillText(`Depth: ${this.depth.gain.value.toFixed(2)}`, this.width - 10, 40);

            const isNoise = this.waveforms[this.currentWaveformIndex] === 'noise';
            ctx.globalAlpha = isNoise ? 0.5 : 1.0;
            this.drawVerticalSlider(ctx, 'rate', 30, 60, 100, 0.01, 20, this.oscillator.frequency.value, false);
            ctx.globalAlpha = 1.0;
            
            this.drawVerticalSlider(ctx, 'depth', this.width - 30, 60, 100, 0.01, 1000, this.depth.gain.value, true);

            ctx.beginPath();
            ctx.arc(this.width / 2, 115, 25, 0, Math.PI * 2);
            ctx.stroke();
            this.drawWaveform(ctx, this.width / 2, 115, 18);
            
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`Ataque`, this.width/2, 190);
            this.drawHorizontalSlider(ctx, 'attack', 20, 205, this.width - 40, 0, 1, 1 - (Math.log(this.gateSmoother.frequency.value/0.1) / Math.log(1000/0.1)), false);
        }

        ctx.restore();
        this.drawConnectors(ctx, hoveredConnectorInfo);
    }
    
    handleDragInteraction(worldPos) {
        if (!this.activeControl || this.isBypassed) return;
        const sliderRect = this.paramHotspots[this.activeControl];
        if (this.activeControl === 'rate' || this.activeControl === 'depth') {
            const localY = worldPos.y - this.y;
            let normalizedValue = (sliderRect.y + sliderRect.height - localY) / sliderRect.height;
            normalizedValue = Math.max(0, Math.min(1, normalizedValue));
            if (this.activeControl === 'rate') {
                const newRate = 0.01 + normalizedValue * (20 - 0.01);
                this.oscillator.frequency.setValueAtTime(newRate, audioContext.currentTime);
            } else if (this.activeControl === 'depth') {
                const newDepth = Math.exp(Math.log(0.01) + normalizedValue * (Math.log(1000) - Math.log(0.01)));
                this.depth.gain.setValueAtTime(newDepth, audioContext.currentTime);
            }
        } else if (this.activeControl === 'attack') {
            const localX = worldPos.x - this.x;
            let normalizedValue = (localX - sliderRect.x) / sliderRect.width;
            normalizedValue = Math.max(0, Math.min(1, normalizedValue));
            
            const minFreq = 0.1;
            const maxFreq = 1000;
            const logMin = Math.log(minFreq);
            const logMax = Math.log(maxFreq);
            const invertedNormalizedValue = 1 - normalizedValue;
            const logNew = logMin + invertedNormalizedValue * (logMax - logMin);
            const newFreq = Math.exp(logNew);
            
            this.gateSmoother.frequency.setTargetAtTime(newFreq, audioContext.currentTime, 0.02);
        }
    }

    disconnect() {
        this.oscillator.disconnect();
        this.depth.disconnect();
        this.dcOffset.disconnect();
        this.gateReceiver.disconnect();
        this.gateSmoother.disconnect();
        this.gateGain.disconnect();
        this.outputScaler.disconnect();
        this.bypassNode.disconnect();
        this.noise.disconnect();
    }

    getState() {
        return {
            id: this.id,
            type: 'LFO',
            x: this.x, y: this.y,
            rate: this.oscillator.frequency.value,
            depth: this.depth.gain.value,
            attack: this.gateSmoother.frequency.value,
            waveform: this.waveforms[this.currentWaveformIndex],
            isBypassed: this.isBypassed
        };
    }

    setState(state) {
        this.id = state.id || this.id;
        this.x = state.x; 
        this.y = state.y;
        this.oscillator.frequency.setValueAtTime(state.rate, audioContext.currentTime);
        if (state.depth !== undefined) {
            this.depth.gain.setValueAtTime(state.depth, audioContext.currentTime);
        }
        if (state.attack !== undefined) {
            this.gateSmoother.frequency.setValueAtTime(state.attack, audioContext.currentTime);
        }
        const wfIndex = this.waveforms.indexOf(state.waveform);
        this.currentWaveformIndex = (wfIndex !== -1) ? wfIndex : 0;
        this.setWaveform(this.waveforms[this.currentWaveformIndex]);
        if (state.isBypassed !== undefined) {
            this.isBypassed = state.isBypassed;
            this.bypassNode.gain.value = this.isBypassed ? 0 : 1;
        }
    }

    // El resto de métodos que no se han modificado
    drawHorizontalSlider(ctx, paramName, x, y, width, minVal, maxVal, currentValue, isLogarithmic) {
        const knobRadius = 8;
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + width, y);
        ctx.stroke();
        let normalizedValue = (currentValue - minVal) / (maxVal - minVal);
        normalizedValue = Math.max(0, Math.min(1, normalizedValue));
        const knobX = x + (normalizedValue * width);
        ctx.beginPath();
        ctx.arc(knobX, y, knobRadius, 0, Math.PI * 2);
        ctx.fillStyle = this.activeControl === paramName ? '#aaffff' : '#4a90e2';
        ctx.fill();
        ctx.strokeStyle = '#E0E0E0';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        this.paramHotspots[paramName] = { x: x, y: y - knobRadius, width: width, height: knobRadius * 2 };
    }
    drawVerticalSlider(ctx, paramName, x, y, height, minVal, maxVal, currentValue, isLogarithmic) {
        const knobRadius = 8;
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + height);
        ctx.stroke();
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
        } else if (type === 'pulse') {
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
    toggleBypass() {
        this.isBypassed = !this.isBypassed;
        const now = audioContext.currentTime;
        const rampTime = 0.02; 
        const newGain = this.isBypassed ? 0 : 1;
        this.bypassNode.gain.linearRampToValueAtTime(newGain, now + rampTime);
    }
    setWaveform(waveform) {
        try { this.oscillator.disconnect(this.depth); } catch (e) { /* Ignore if not connected */ }
        try { this.noise.disconnect(this.depth); } catch (e) { /* Ignore if not connected */ }
        if (waveform === 'noise') {
            this.noise.connect(this.depth);
        } else if (waveform === 'pulse') {
            this.oscillator.type = 'square';
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
        if (this.isBypassed) return false;
        const localX = x - this.x;
        const localY = y - this.y;
        const symbolX = this.width / 2;
        const symbolY = 115;
        const dist = Math.sqrt(Math.pow(localX - symbolX, 2) + Math.pow(localY - symbolY, 2));
        if (dist < 25) {
            const newIndex = (this.currentWaveformIndex + 1) % this.waveforms.length;
            this.setWaveform(this.waveforms[newIndex]);
            return true;
        }
        return false;
    }
    checkInteraction(pos) {
        if (this.isBypassed) return false;
        const localPos = { x: pos.x - this.x, y: pos.y - this.y };
        for (const [param, rect] of Object.entries(this.paramHotspots)) {
            if (localPos.x >= rect.x && localPos.x <= rect.x + rect.width &&
                localPos.y >= rect.y && localPos.y <= rect.y + rect.height) {
                this.activeControl = param;
                return true;
            }
        }
        return false;
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
}