// src/modules/audio/modulators/LFO.js

export class LFO {
    constructor(audioContext, x, y, id = null, initialState = {}) {
        this.audioContext = audioContext;
        this.id = id || `lfo-${Date.now()}`;
        this.x = x;
        this.y = y;
        this.width = 160;
        this.height = 300;
        this.type = 'LFO';
        this.bypassed = initialState.bypassed || false;

        this.waveforms = ['sine', 'square', 'sawtooth', 'triangle'];
        
        this.params = {
            rate: initialState.rate || 5,
            depth: initialState.depth !== undefined ? initialState.depth : 1,
            attack: initialState.attack || 0.1,
            waveform: initialState.waveform || 'sine'
        };
        this.currentWaveformIndex = this.waveforms.indexOf(this.params.waveform);

        this.activeControl = null;
        this.paramHotspots = {};
        this.dragStart = {};
        
        this.workletNode = null;
        this.gateProcessorNode = null;
        this.attackEnvelope = this.audioContext.createGain();
        this.outputScaler = this.audioContext.createGain();
        this.bypassGain = this.audioContext.createGain();
        
        this.inputs = {
            'Rate CV': { x: 30, y: this.height, type: 'cv', target: null },
            'Depth CV': { x: this.width - 30, y: this.height, type: 'cv', target: this.outputScaler.gain },
            'Gate': { x: 0, y: this.height / 2, type: 'gate', target: null }
        };
        this.outputs = {
            'Out': { x: this.width, y: this.height / 2, type: 'cv', source: this.bypassGain }
        };
        
        this.readyPromise = this.initWorklets();
    }

    async initWorklets() {
        try {
            this.workletNode = new AudioWorkletNode(this.audioContext, 'lfo-processor');
            this.gateProcessorNode = new AudioWorkletNode(this.audioContext, 'gate-processor');

            this.inputs['Rate CV'].target = this.workletNode.parameters.get('vOct'); 
            this.inputs.Gate.target = this.gateProcessorNode;

            this.attackEnvelope.gain.value = 0;
            this.workletNode.connect(this.attackEnvelope);
            this.attackEnvelope.connect(this.outputScaler);
            this.outputScaler.connect(this.bypassGain);
            
            this.gateProcessorNode.port.onmessage = (event) => {
                const now = this.audioContext.currentTime;
                if (event.data === 'gate-on') {
                    this.attackEnvelope.gain.cancelScheduledValues(now);
                    this.attackEnvelope.gain.setTargetAtTime(1.0, now, this.params.attack);
                } else if (event.data === 'gate-off') {
                    this.attackEnvelope.gain.cancelScheduledValues(now);
                    this.attackEnvelope.gain.setTargetAtTime(0.0, now, 0.01);
                }
            };

            this.setState(this.params);
            this.updateBypassState();
            
        } catch (err) {
            console.error(`[LFO-${this.id}] Initialization error:`, err);
        }
    }

    toggleBypass() {
        this.bypassed = !this.bypassed;
        this.updateBypassState();
    }

    updateBypassState() {
        const rampTime = 0.02;
        const gainValue = this.bypassed ? 0 : 1;
        this.bypassGain.gain.setTargetAtTime(gainValue, this.audioContext.currentTime, rampTime);
    }

    setWaveform(index) {
        this.currentWaveformIndex = index;
        this.params.waveform = this.waveforms[index];
        if(this.workletNode) {
            this.workletNode.port.postMessage({ type: 'waveform', value: index });
        }
    }
    
    draw(ctx, isSelected, hoveredConnectorInfo) {
        ctx.save();
        ctx.translate(this.x, this.y);

        ctx.fillStyle = this.bypassed ? '#404040' : '#222';
        ctx.strokeStyle = isSelected ? '#aaffff' : '#E0E0E0';
        ctx.lineWidth = 2;
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.strokeRect(0, 0, this.width, this.height);

        ctx.fillStyle = '#E0E0E0';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('LFO', this.width / 2, 22);

        if (this.bypassed) {
            ctx.fillStyle = '#aaa';
            ctx.font = 'bold 12px Arial';
            ctx.fillText('BYPASS', this.width / 2, this.height / 2);
        } else {
            this.drawVerticalSlider(ctx, 'rate', 30, 60, 130, 0.01, 50, this.params.rate, 'Hz', true);
            this.drawVerticalSlider(ctx, 'depth', this.width - 30, 60, 130, 0, 1, this.params.depth, '', false);
            ctx.strokeStyle = '#E0E0E0';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(this.width/2 - 25, 80, 50, 50);
            this.drawWaveform(ctx, this.width/2, 105, 20);
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('ATTACK', this.width / 2, 210);
            this.drawHorizontalSlider(ctx, 'attack', 20, 225, this.width - 40, 0.001, 3.5, this.params.attack);
        }

        this.drawConnectors(ctx, hoveredConnectorInfo);
        ctx.restore();
    }
    
    drawHorizontalSlider(ctx, paramName, x, y, width, minVal, maxVal, currentValue) {
        const knobRadius = 8;
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + width, y);
        ctx.stroke();
        let normalizedValue = (currentValue - minVal) / (maxVal - minVal);
        const knobX = x + (Math.max(0, Math.min(1, normalizedValue)) * width);
        ctx.beginPath();
        ctx.arc(knobX, y, knobRadius, 0, Math.PI * 2);
        ctx.fillStyle = this.activeControl === paramName ? '#aaffff' : '#4a90e2';
        ctx.fill();
        ctx.font = '10px Arial';
        ctx.fillStyle = '#E0E0E0';
        ctx.textAlign = 'center';
        ctx.fillText(currentValue.toFixed(2) + 's', x + width/2, y + knobRadius + 12);
        this.paramHotspots[paramName] = { x: x, y: y - knobRadius, width: width, height: knobRadius * 2, min: minVal, max: maxVal };
    }
    
    drawVerticalSlider(ctx, paramName, x, y, height, minVal, maxVal, currentValue, unit, isLog) {
        const knobRadius = 8;
        ctx.font = '10px Arial';
        ctx.fillStyle = '#E0E0E0';
        ctx.textAlign = 'center';
        ctx.fillText(paramName.toUpperCase(), x, y - 5);
        ctx.fillText(currentValue.toFixed(2) + (unit || ''), x, y + height + 15);
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + height);
        ctx.stroke();
        let normalizedValue;
        const normalizedParamValue = (currentValue - minVal) / (maxVal - minVal);
        if (isLog) {
            normalizedValue = (Math.log(currentValue) - Math.log(minVal)) / (Math.log(maxVal) - Math.log(minVal));
        } else if (paramName === 'depth') {
            normalizedValue = Math.cbrt(normalizedParamValue);
        } else {
            normalizedValue = normalizedParamValue;
        }
        const knobY = y + height - (Math.max(0, Math.min(1, normalizedValue)) * height);
        ctx.beginPath();
        ctx.arc(x, knobY, knobRadius, 0, Math.PI * 2);
        ctx.fillStyle = this.activeControl === paramName ? '#aaffff' : '#4a90e2';
        ctx.fill();
        this.paramHotspots[paramName] = { x: x - knobRadius, y: y, width: knobRadius * 2, height: height, min: minVal, max: maxVal, isLog: isLog };
    }

    drawWaveform(ctx, cx, cy, radius) {
        ctx.strokeStyle = '#E0E0E0';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const type = this.waveforms[this.currentWaveformIndex];
        const r = radius * 0.8;
        switch (type) {
            case 'sine': ctx.moveTo(cx - r, cy); ctx.quadraticCurveTo(cx - r/2, cy - r, cx, cy); ctx.quadraticCurveTo(cx + r/2, cy + r, cx + r, cy); break;
            case 'square': ctx.moveTo(cx - r, cy + r/2); ctx.lineTo(cx - r, cy - r/2); ctx.lineTo(cx, cy - r/2); ctx.lineTo(cx, cy + r/2); ctx.lineTo(cx + r, cy + r/2); break;
            case 'sawtooth': ctx.moveTo(cx - r, cy + r/2); ctx.lineTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.lineTo(cx + r, cy - r/2); break;
            case 'triangle': ctx.moveTo(cx - r, cy + r/2); ctx.lineTo(cx - r/2, cy - r/2); ctx.lineTo(cx + r/2, cy + r/2); ctx.lineTo(cx + r, cy - r/2); break;
        }
        ctx.stroke();
    }

    drawConnectors(ctx, hovered) {
        const connectorRadius = 8;
        ctx.font = '10px Arial';
        Object.entries(this.inputs).forEach(([name, props]) => {
            const ix = props.x, iy = props.y;
            const isHovered = hovered?.module === this && hovered.connector?.name === name;
            ctx.beginPath(); ctx.arc(ix, iy, connectorRadius, 0, Math.PI * 2);
            ctx.fillStyle = isHovered ? 'white' : '#4a90e2'; ctx.fill();
            ctx.fillStyle = '#E0E0E0';
            ctx.textAlign = 'center';
            if (name === 'Gate') {
                ctx.textAlign = 'left';
                ctx.fillText(name.toUpperCase(), ix + connectorRadius + 4, iy + 4);
            } else {
                 ctx.fillText(name, ix, iy + connectorRadius + 12);
            }
        });
        Object.entries(this.outputs).forEach(([name, props]) => {
            const ox = props.x, oy = props.y;
            const isHovered = hovered?.module === this && hovered.connector?.name === name;
            ctx.beginPath(); ctx.arc(ox, oy, connectorRadius, 0, Math.PI * 2);
            ctx.fillStyle = isHovered ? 'white' : '#222'; ctx.fill();
            ctx.strokeStyle = '#4a90e2'; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.fillStyle = '#E0E0E0'; ctx.textAlign = 'right';
            ctx.fillText(name.toUpperCase(), ox - connectorRadius - 4, oy + 4);
        });
    }

    checkInteraction(pos) {
        if (this.bypassed) return false;
        const localPos = { x: pos.x - this.x, y: pos.y - this.y };
        for (const [param, rect] of Object.entries(this.paramHotspots)) {
            if (localPos.x >= rect.x && localPos.x <= rect.x + rect.width && localPos.y >= rect.y && localPos.y <= rect.y + rect.height) {
                this.activeControl = param;
                this.dragStart = { x: pos.x, y: pos.y, value: this.params[param] };
                return true;
            }
        }
        return false;
    }

    handleDragInteraction(worldPos) {
        if (!this.activeControl) return;
        const sliderRect = this.paramHotspots[this.activeControl];
        let newValue;
        
        if (this.activeControl === 'attack') {
            const localX = worldPos.x - this.x;
            let normVal = (localX - sliderRect.x) / sliderRect.width;
            normVal = Math.max(0, Math.min(1, normVal));
            newValue = sliderRect.min + normVal * (sliderRect.max - sliderRect.min);
        } else {
            const localY = worldPos.y - this.y;
            let normVal = (sliderRect.y + sliderRect.height - localY) / sliderRect.height;
            normVal = Math.max(0, Math.min(1, normVal));
            
            if (this.activeControl === 'depth') {
                normVal = Math.pow(normVal, 3);
            }
            
            if (sliderRect.isLog) {
                newValue = Math.exp(Math.log(sliderRect.min) + normVal * (Math.log(sliderRect.max) - Math.log(sliderRect.min)));
            } else {
                newValue = sliderRect.min + normVal * (sliderRect.max - sliderRect.min);
            }
        }
        this.params[this.activeControl] = newValue;
        
        if (this.workletNode) {
            const now = this.audioContext.currentTime;
            if (this.activeControl === 'rate') {
                this.workletNode.parameters.get('frequency').setTargetAtTime(newValue, now, 0.01);
            } else if (this.activeControl === 'depth') {
                this.outputScaler.gain.setTargetAtTime(newValue, now, 0.01);
            }
        }
    }

    endInteraction() { this.activeControl = null; }

    handleClick(x, y) {
        if (this.bypassed) return false;
        const localPos = { x: x - this.x, y: y - this.y };
        if (localPos.x > this.width/2 - 25 && localPos.x < this.width/2 + 25 &&
            localPos.y > 80 && localPos.y < 130) {
            const newIndex = (this.currentWaveformIndex + 1) % this.waveforms.length;
            this.setWaveform(newIndex);
            return true;
        }
        return false;
    }
    
    getConnectorAt(x, y) {
        const localX = x - this.x;
        const localY = y - this.y;
        for (const [name, props] of Object.entries(this.inputs)) {
            if (Math.hypot(localX - props.x, localY - props.y) < 9) return { name, type: 'input', props, module: this };
        }
        for (const [name, props] of Object.entries(this.outputs)) {
            if (Math.hypot(localX - props.x, localY - props.y) < 9) return { name, type: 'output', props, module: this };
        }
        return null;
    }
    
    getState() {
        return { 
            id: this.id, type: this.type, x: this.x, y: this.y, 
            bypassed: this.bypassed, ...this.params
        };
    }

    setState(state) {
        this.id = state.id || this.id;
        this.x = state.x ?? this.x;
        this.y = state.y ?? this.y;
        this.bypassed = state.bypassed || false;

        this.params.rate = state.rate || 5;
        this.params.depth = state.depth !== undefined ? state.depth : 1;
        this.params.attack = state.attack || 0.1;
        this.params.waveform = this.waveforms.includes(state.waveform) ? state.waveform : 'sine';
        this.currentWaveformIndex = this.waveforms.indexOf(this.params.waveform);

        if (this.workletNode) {
            const now = this.audioContext.currentTime;
            this.workletNode.parameters.get('frequency').setValueAtTime(this.params.rate, now);
            this.outputScaler.gain.setValueAtTime(this.params.depth, now);
            this.setWaveform(this.currentWaveformIndex);
        }
        this.updateBypassState();
    }
    
    destroy() {
        this.workletNode?.disconnect();
        this.gateProcessorNode?.port.close();
        this.gateProcessorNode?.disconnect();
        this.attackEnvelope?.disconnect();
        this.outputScaler?.disconnect();
        this.bypassGain?.disconnect();
    }
}