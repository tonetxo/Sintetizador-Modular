// modules/LFO.js
import { audioContext } from './AudioContext.js';

export class LFO {
    constructor(x, y, id = null, initialState = {}) {
        this.id = id || `lfo-${Date.now()}`;
        this.x = x;
        this.y = y;
        this.width = 160;
        this.height = 260;
        this.type = 'LFO';

        this.workletNode = null;
        this.rateParam = null;
        this.lfoDepthGain = null;
        this.inputs = {};
        this.outputs = {};
        this.activeControl = null;
        this.paramHotspots = {};
        this.waveforms = ['sine', 'square', 'sawtooth', 'triangle', 'noise'];
        this.currentWaveformIndex = 0;
        this.isBypassed = false;

        this.initialState = initialState;
        this.readyPromise = this.init();
    }

    async init() {
        try {
            this.workletNode = new AudioWorkletNode(audioContext, 'lfo-processor');
        } catch (e) {
            console.error(`[LFO-${this.id}] Error al crear el worklet para el LFO:`, e);
            return; 
        }

        this.rateParam = this.workletNode.parameters.get('frequency');
        // Usamos initialState para los valores por defecto, o un valor fijo si no existe
        this.rateParam.setValueAtTime(this.initialState.rate !== undefined ? this.initialState.rate : 5, audioContext.currentTime);

        this.lfoDepthGain = audioContext.createGain();
        this.lfoDepthGain.gain.setValueAtTime(this.initialState.depth !== undefined ? this.initialState.depth : 3, audioContext.currentTime);

        this.attackEnvelope = audioContext.createGain();
        this.attackEnvelope.gain.value = 0;

        this.attackTimeConstant = this.initialState.attack !== undefined ? this.initialState.attack : 0.1;

        try {
            this.gateProcessorNode = new AudioWorkletNode(audioContext, 'gate-processor');
            this.gateProcessorNode.connect(audioContext.destination);
            this.gateProcessorNode.port.onmessage = (event) => {
                const now = audioContext.currentTime;
                if (event.data === 'gate-on') {
                    this.attackEnvelope.gain.cancelScheduledValues(now);
                    this.attackEnvelope.gain.setTargetAtTime(1.0, now, this.attackTimeConstant);
                } else if (event.data === 'gate-off') {
                    this.attackEnvelope.gain.cancelScheduledValues(now);
                    this.attackEnvelope.gain.setTargetAtTime(0.0, now, 0.01);
                }
            };
        } catch (e) {
            console.error(`[LFO-${this.id}] Error al crear el worklet de gate para el LFO:`, e);
        }
        
        this.outputScaler = audioContext.createGain();
        this.outputScaler.gain.value = 0.5;

        this.isBypassed = this.initialState.isBypassed || false;
        this.bypassNode = audioContext.createGain();
        this.bypassNode.gain.value = this.isBypassed ? 0 : 1;
        
        const dummyGain = audioContext.createGain();
        dummyGain.gain.value = 0;
        this.bypassNode.connect(dummyGain);
        dummyGain.connect(audioContext.destination);

        this.workletNode.connect(this.lfoDepthGain);
        this.lfoDepthGain.connect(this.attackEnvelope);
        this.attackEnvelope.connect(this.outputScaler);
        this.outputScaler.connect(this.bypassNode);
        
        const wfIndex = this.waveforms.indexOf(this.initialState.waveform || 'sine');
        this.currentWaveformIndex = (wfIndex !== -1) ? wfIndex : 0;

        this.inputs = {
            'Rate CV': { x: this.width / 2 - 40, y: this.height, type: 'cv', target: this.rateParam, orientation: 'vertical' },
            'Gate': { x: this.width / 2 + 40, y: this.height, type: 'gate', target: this.gateProcessorNode, orientation: 'vertical' }
        };
        this.outputs = {
            'SALIDA': { x: this.width, y: this.height / 2, type: 'cv', source: this.bypassNode, orientation: 'horizontal' }
        };
        
        this.setWaveform(this.waveforms[this.currentWaveformIndex]);
        // --- CORRECCIÓN: No llamamos a setState durante la inicialización ---
        // La inicialización ya usa los valores de `initialState`. `setState` es solo para después.
    }

    // ... (la función draw no necesita cambios)
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
        
        if (!this.workletNode) {
            ctx.font = 'bold 16px Arial';
            ctx.fillStyle = 'red';
            ctx.fillText('ERROR', this.width / 2, this.height / 2);
        } else if (this.isBypassed) {
            ctx.font = 'bold 16px Arial';
            ctx.fillStyle = '#aaa';
            ctx.fillText('BYPASSED', this.width / 2, this.height / 2);
        } else {
            ctx.font = '10px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(`Rate: ${(this.rateParam?.value ?? 0).toFixed(2)}Hz`, 10, 40);
            ctx.textAlign = 'right';
            ctx.fillText(`Depth: ${(this.lfoDepthGain?.gain.value ?? 0).toFixed(2)}`, this.width - 10, 40);

            const isNoise = this.waveforms[this.currentWaveformIndex] === 'noise';
            ctx.globalAlpha = isNoise ? 0.5 : 1.0;
            this.drawVerticalSlider(ctx, 'rate', 30, 60, 100, 0.01, 20, this.rateParam.value, false);
            ctx.globalAlpha = 1.0;
            
            this.drawVerticalSlider(ctx, 'depth', this.width - 30, 60, 100, 0.01, 10, this.lfoDepthGain.gain.value, true);

            ctx.beginPath();
            ctx.arc(this.width / 2, 115, 25, 0, Math.PI * 2);
            ctx.stroke();
            this.drawWaveform(ctx, this.width / 2, 115, 18);
            
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`Ataque`, this.width/2, 190);
            const attackValueForSlider = (this.attackTimeConstant - 0.001) / (3.5 - 0.001);
            this.drawHorizontalSlider(ctx, 'attack', 20, 205, this.width - 40, 0, 1, attackValueForSlider, false);
        }

        ctx.restore();
        this.drawConnectors(ctx, hoveredConnectorInfo);
    }
    
    // ...
    getState() {
        if (!this.workletNode) return { id: this.id, type: 'LFO', x: this.x, y: this.y, error: true };
        return {
            id: this.id,
            type: 'LFO',
            x: this.x, y: this.y,
            rate: this.rateParam.value,
            depth: this.lfoDepthGain.gain.value,
            attack: this.attackTimeConstant,
            waveform: this.waveforms[this.currentWaveformIndex],
            isBypassed: this.isBypassed
        };
    }

    // --- CORRECCIÓN: Hacemos setState más seguro ---
    setState(state) {
        if (!this.workletNode || !state) return;
        this.id = state.id || this.id;
        this.x = state.x; 
        this.y = state.y;

        if (this.rateParam && state.rate !== undefined) {
            this.rateParam.setValueAtTime(state.rate, audioContext.currentTime);
        }
        if (this.lfoDepthGain && state.depth !== undefined) {
            this.lfoDepthGain.gain.setValueAtTime(state.depth, audioContext.currentTime);
        }
        if (state.attack !== undefined) {
            this.attackTimeConstant = state.attack;
        }
        if (state.waveform !== undefined) {
            const wfIndex = this.waveforms.indexOf(state.waveform);
            if(wfIndex !== -1) {
                this.currentWaveformIndex = wfIndex;
                this.setWaveform(this.waveforms[this.currentWaveformIndex]);
            }
        }
        if (state.isBypassed !== undefined) {
            this.isBypassed = state.isBypassed;
            this.bypassNode.gain.value = this.isBypassed ? 0 : 1;
        }
    }
    
    // ... (El resto del archivo LFO.js sin cambios)
    handleDragInteraction(worldPos) {
        if (!this.activeControl || this.isBypassed || !this.workletNode) return;
        const sliderRect = this.paramHotspots[this.activeControl];
        if (this.activeControl === 'rate' || this.activeControl === 'depth') {
            const localY = worldPos.y - this.y;
            let normalizedValue = (sliderRect.y + sliderRect.height - localY) / sliderRect.height;
            normalizedValue = Math.max(0, Math.min(1, normalizedValue));
            if (this.activeControl === 'rate') {
                const newRate = 0.01 + normalizedValue * (20 - 0.01);
                this.rateParam.setTargetAtTime(newRate, audioContext.currentTime, 0.01);
            } else if (this.activeControl === 'depth') {
                const newDepth = Math.exp(Math.log(0.01) + normalizedValue * (Math.log(10) - Math.log(0.01)));
                this.lfoDepthGain.gain.setTargetAtTime(newDepth, audioContext.currentTime, 0.01);
            }
        } else if (this.activeControl === 'attack') {
            const localX = worldPos.x - this.x;
            let normalizedValue = (localX - sliderRect.x) / sliderRect.width;
            normalizedValue = Math.max(0, Math.min(1, normalizedValue));
            
            const minTime = 0.001;
            const maxTime = 3.5;
            this.attackTimeConstant = minTime + normalizedValue * (maxTime - minTime);
        }
    }

    disconnect() {
        if (this.workletNode) this.workletNode.disconnect();
        if (this.lfoDepthGain) this.lfoDepthGain.disconnect();
        if (this.attackEnvelope) this.attackEnvelope.disconnect();
        if (this.gateProcessorNode) {
            this.gateProcessorNode.port.close();
            this.gateProcessorNode.disconnect();
        }
        if (this.outputScaler) this.outputScaler.disconnect();
        if (this.bypassNode) this.bypassNode.disconnect();
    }
    
    setWaveform(waveform) {
        if (!this.workletNode) return;
        const wfIndex = this.waveforms.indexOf(waveform);
        if (wfIndex !== -1) {
            this.currentWaveformIndex = wfIndex;
            const workletWfIndex = waveform === 'noise' ? 4 : wfIndex;
            this.workletNode.port.postMessage({ type: 'waveform', value: workletWfIndex });
        }
    }
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
            for (let i = 0; i < 15; i++) {
                const randX = cx + (Math.random() - 0.5) * radius * 1.5;
                const randY = cy + (Math.random() - 0.5) * radius * 1.5;
                ctx.fillRect(randX, randY, 2, 2);
            }
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
        if (!this.bypassNode) return;
        this.isBypassed = !this.isBypassed;
        const now = audioContext.currentTime;
        const rampTime = 0.02; 
        const newGain = this.isBypassed ? 0 : 1;
        this.bypassNode.gain.linearRampToValueAtTime(newGain, now + rampTime);
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