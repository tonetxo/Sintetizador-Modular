// src/modules/audio/oscillators/VCO.js

export class VCO {
    constructor(audioContext, x, y, id = null, initialState = {}) {
        this.audioContext = audioContext;
        this.id = id || `vco-${Date.now()}`;
        this.type = 'VCO';
        this.x = x;
        this.y = y;
        this.width = 250;
        this.height = 420;

        this.waveforms = ['sine', 'square', 'sawtooth', 'triangle'];

        this.params = {
            frequency: initialState.frequency || 440,
            detune: initialState.detune || 0,
            waveform: this.waveforms.includes(initialState.waveform) ? initialState.waveform : 'sawtooth',
            pulseWidth: initialState.pulseWidth || 0.5,
        };

        this.activeControl = null;
        this.hotspots = {};
        this.dragStart = {};
        this.deadzone = 5;

        // Propiedades de Audio
        this.workletNode = null;
        this.output = this.audioContext.createGain();

        // La inicialización es asíncrona, ModuleManager no debe esperar
        this.readyPromise = this.initWorklet(initialState);
    }

    async initWorklet(initialState) {
        // Envolver en try/catch para evitar que un fallo en un módulo detenga toda la app
        try {
            this.workletNode = new AudioWorkletNode(this.audioContext, 'vco-processor');

            this.frequencyParam = this.workletNode.parameters.get('frequency');
            this.pulseWidthParam = this.workletNode.parameters.get('pulseWidth');
            this.detuneParam = this.workletNode.parameters.get('detune');
            this.vOctInNode = this.workletNode.parameters.get('vOct');
            this.pwmInNode = this.workletNode.parameters.get('pwm');
            this.fm1InNode = this.workletNode.parameters.get('fm1');
            this.fm2InNode = this.workletNode.parameters.get('fm2');

            this.workletNode.connect(this.output);
            
            this.setState(initialState); // Aplica el estado inicial completo
            this.updateParams();

        } catch(error) {
            console.error(`[VCO-${this.id}] Error initializing worklet:`, error);
            // Si falla, el módulo quedará en un estado no funcional pero no romperá la app.
        }
    }

    updateParams() {
        if (!this.workletNode) return;
        
        const waveformIndex = this.waveforms.indexOf(this.params.waveform);
        const now = this.audioContext.currentTime;

        this.frequencyParam.setTargetAtTime(this.params.frequency, now, 0.01);
        this.detuneParam.setTargetAtTime(this.params.detune, now, 0.01);
        this.pulseWidthParam.setTargetAtTime(this.params.pulseWidth, now, 0.01);
        
        if (waveformIndex !== -1) {
            this.workletNode.port.postMessage({ type: 'waveform', value: waveformIndex });
        }
    }

    get inputs() {
        const availableInputs = {
            '1v/oct': { x: 0, y: 150, type: 'cv', target: this.vOctInNode },
            'FM1': { x: 0, y: 210, type: 'cv', target: this.fm1InNode },
            'FM2': { x: 0, y: 270, type: 'cv', target: this.fm2InNode },
        };
        // Solo mostrar la entrada PWM si la onda es cuadrada
        if (this.params.waveform === 'square') {
            availableInputs['PWM'] = { x: 0, y: 330, type: 'cv', target: this.pwmInNode };
        }
        return availableInputs;
    }

    get outputs() {
        return {
            'Out': { x: this.width, y: this.height / 2, type: 'audio', source: this.output }
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
        ctx.fillText('VCO', this.width / 2, 22);

        this.drawKnob(ctx, 'frequency', 'FREQ', this.width / 2, 80, 20, 5000, this.params.frequency, this.activeControl === 'frequency', true);
        this.drawKnob(ctx, 'detune', 'FINE', this.width / 2, 170, -100, 100, this.params.detune, this.activeControl === 'detune');
        
        if (this.params.waveform === 'square') {
            this.drawKnob(ctx, 'pulseWidth', 'PW', this.width / 2, 260, 0.01, 0.99, this.params.pulseWidth, this.activeControl === 'pulseWidth');
        }
        
        this.drawSelector(ctx, 'waveform', 'WAVE', this.width / 2, 350, 100, 30, this.params.waveform);

        this.drawConnectors(ctx, hoveredConnectorInfo);
        ctx.restore();
    }
    
    drawKnob(ctx, paramName, label, x, y, min, max, value, isActive, isLog = false) {
        const knobRadius = 22;
        const angleRange = Math.PI * 1.5;
        const startAngle = Math.PI * 0.75;
        let normalizedValue = (value - min) / (max - min);
        if (isLog) {
            normalizedValue = (Math.log(value) - Math.log(min)) / (Math.log(max) - Math.log(min));
        }
        const angle = startAngle + normalizedValue * angleRange;

        ctx.font = '10px Arial'; ctx.fillStyle = '#E0E0E0'; ctx.textAlign = 'center';
        ctx.fillText(label, x, y - knobRadius - 5);
        const displayValue = paramName === 'frequency' ? `${value.toFixed(1)} Hz` : (paramName === 'pulseWidth' ? `${(value * 100).toFixed(0)}%` : `${value.toFixed(0)}c`);
        ctx.fillText(displayValue, x, y + knobRadius + 12);
        
        ctx.strokeStyle = '#555'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, knobRadius, startAngle, startAngle + angleRange); ctx.stroke();
        
        ctx.strokeStyle = isActive ? '#ffffaa' : '#4a90e2';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(angle) * knobRadius, y + Math.sin(angle) * knobRadius);
        ctx.stroke();

        this.hotspots[paramName] = { x: x - knobRadius, y: y - knobRadius, width: knobRadius * 2, height: knobRadius * 2, min, max, type: 'knob', isLog };
    }
    
    drawSelector(ctx, paramName, label, x, y, w, h, value) {
        ctx.strokeStyle = '#E0E0E0'; ctx.strokeRect(x - w/2, y, w, h);
        ctx.fillStyle = '#E0E0E0'; ctx.font = '10px Arial'; ctx.textAlign = 'center';
        ctx.fillText(label, x, y - 5);
        ctx.font = 'bold 12px Arial'; ctx.textBaseline = 'middle';
        ctx.fillText(String(value).toUpperCase(), x, y + h/2);
        this.hotspots[paramName] = { x: x - w/2, y, width: w, height: h, type: 'selector' };
    }
    
    drawConnectors(ctx, hovered) {
        const connectorRadius = 8;
        ctx.font = '10px Arial';

        Object.entries(this.inputs).forEach(([name, props]) => {
            const ix = props.x, iy = props.y;
            const isHovered = hovered?.module === this && hovered.connector.name === name;
            ctx.beginPath(); ctx.arc(ix, iy, connectorRadius, 0, Math.PI * 2);
            ctx.fillStyle = isHovered ? 'white' : '#4a90e2'; ctx.fill();
            ctx.fillStyle = '#E0E0E0'; ctx.textAlign = 'left';
            ctx.fillText(name.toUpperCase(), ix + connectorRadius + 4, iy + 4);
        });

        Object.entries(this.outputs).forEach(([name, props]) => {
            const ox = props.x, oy = props.y;
            const isHovered = hovered?.module === this && hovered.connector.name === name;
            ctx.beginPath(); ctx.arc(ox, oy, connectorRadius, 0, Math.PI * 2);
            ctx.fillStyle = isHovered ? 'white' : '#222'; ctx.fill();
            ctx.strokeStyle = '#4a90e2'; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.fillStyle = '#E0E0E0'; ctx.textAlign = 'right';
            ctx.fillText(name.toUpperCase(), ox - connectorRadius - 4, oy + 4);
        });
    }

    isInside(pos, rect) {
        return pos.x >= rect.x && pos.x <= rect.x + rect.width && pos.y >= rect.y && pos.y <= rect.y + rect.height;
    }

    checkInteraction(pos) {
        const localPos = { x: pos.x - this.x, y: pos.y - this.y };
        for (const [name, spot] of Object.entries(this.hotspots)) {
            if (this.isInside(localPos, spot) && spot.type === 'knob') {
                this.activeControl = name;
                this.dragStart = { y: localPos.y, value: this.params[name] };
                return true;
            }
        }
        return false;
    }

    handleClick(x, y) {
        const localPos = { x: x - this.x, y: y - this.y };
        if (this.isInside(localPos, this.hotspots['waveform'])) {
            const currentIndex = this.waveforms.indexOf(this.params.waveform);
            const nextIndex = (currentIndex + 1) % this.waveforms.length;
            this.params.waveform = this.waveforms[nextIndex];
            this.updateParams();
            return true;
        }
        return false;
    }

    endInteraction() { this.activeControl = null; }

    handleDragInteraction(worldPos) {
        if (!this.activeControl) return;
        const hotspot = this.hotspots[this.activeControl];
        const localY = worldPos.y - this.y;
        const dy = this.dragStart.y - localY;
        let newValue;

        if (hotspot.isLog) {
            const logRange = Math.log(hotspot.max) - Math.log(hotspot.min);
            const startValLog = Math.log(Math.max(hotspot.min, this.dragStart.value));
            const newNorm = ((startValLog - Math.log(hotspot.min)) / logRange) + (dy * 0.005);
            newValue = Math.exp(Math.log(hotspot.min) + newNorm * logRange);
        } else {
            const sensitivity = (hotspot.max - hotspot.min) / 128;
            newValue = this.dragStart.value + dy * sensitivity;
        }
        
        this.params[this.activeControl] = Math.max(hotspot.min, Math.min(hotspot.max, newValue));
        this.updateParams();
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

    getState() { return { id: this.id, type: this.type, x: this.x, y: this.y, ...this.params }; }
    
    setState(state) {
        this.id = state.id || this.id;
        this.x = state.x ?? this.x; 
        this.y = state.y ?? this.y;
        Object.keys(this.params).forEach(key => {
            if (state[key] !== undefined) {
                this.params[key] = state[key];
            }
        });
    }

    disconnect() { this.workletNode?.disconnect(); this.output?.disconnect(); }
}