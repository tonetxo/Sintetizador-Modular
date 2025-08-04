// modules/VCO.js
import { audioContext } from './AudioContext.js';

export class VCO {
    constructor(x, y, id = null, initialState = {}) {
        this.id = id || `vco-${Date.now()}`;
        this.type = 'VCO';
        this.x = x;
        this.y = y;
        this.width = 250;
        this.height = 420; // Aumentamos la altura para los nuevos controles

        this.waveforms = ['sine', 'square', 'sawtooth', 'triangle'];

        this.params = {
            frequency: initialState.frequency || 440,
            detune: initialState.detune || 0,
            waveform: (initialState.waveform !== undefined && initialState.waveform !== null && this.waveforms.includes(initialState.waveform)) ? initialState.waveform : 'sawtooth',
            pulseWidth: initialState.pulseWidth || 0.5, // Nuevo parámetro para PWM
        };

        this.activeControl = null;
        this.hotspots = {};
        this.deadzone = 5; // Pixels

        this.readyPromise = this.initWorklet(initialState);
    }

    async initWorklet(initialState) {
        try {
            // Un único worklet se encargará de todas las formas de onda
            this.workletNode = new AudioWorkletNode(audioContext, 'vco-processor');

            // Conectar parámetros del worklet para control en tiempo real
            this.frequencyParam = this.workletNode.parameters.get('frequency');
            this.pulseWidthParam = this.workletNode.parameters.get('pulseWidth');
            this.detuneParam = this.workletNode.parameters.get('detune');
            
            // Estas son las entradas reales para la modulación desde otros módulos
            this.vOctInNode = this.workletNode.parameters.get('vOct');
            this.pwmInNode = this.workletNode.parameters.get('pwm');
            this.fm1InNode = this.workletNode.parameters.get('fm1');
            this.fm2InNode = this.workletNode.parameters.get('fm2');

            this.output = audioContext.createGain();
            this.workletNode.connect(this.output);
            
            if (initialState && Object.keys(initialState).length > 0) {
                this.setState(initialState);
            } else {
                this.updateParams();
            }

            // Enviar la forma de onda inicial al worklet
            this.workletNode.port.postMessage({
                type: 'waveform',
                value: this.waveforms.indexOf(this.params.waveform)
            });

        } catch(error) {
            console.error(`[VCO-${this.id}] Error initializing worklet:`, error);
        }
    }

    updateParams() {
        if (!this.workletNode) return;
        const waveformIndex = this.waveforms.indexOf(this.params.waveform);
        console.log(`[VCO-${this.id}] updateParams - waveform: ${this.params.waveform}, index: ${waveformIndex}`);
        
        this.frequencyParam.setTargetAtTime(this.params.frequency, audioContext.currentTime, 0.01);
        this.detuneParam.setTargetAtTime(this.params.detune, audioContext.currentTime, 0.01);
        this.pulseWidthParam.setTargetAtTime(this.params.pulseWidth, audioContext.currentTime, 0.01);
        
        // Enviar la forma de onda como mensaje al worklet
        if (waveformIndex !== -1) {
            this.workletNode.port.postMessage({
                type: 'waveform',
                value: waveformIndex
            });
        } else {
            console.warn(`[VCO-${this.id}] Invalid waveform: ${this.params.waveform}. Setting to default (sawtooth).`);
            this.workletNode.port.postMessage({
                type: 'waveform',
                value: this.waveforms.indexOf('sawtooth')
            });
        }
    }

    get inputs() {
        const inputPositions = [
            { name: '1v/oct', y: this.height / 2 - 60, type: 'cv', target: this.vOctInNode },
            { name: 'FM1', y: this.height / 2 - 20, type: 'cv', target: this.fm1InNode },
            { name: 'FM2', y: this.height / 2 + 20, type: 'cv', target: this.fm2InNode },
            { name: 'PWM', y: this.height / 2 + 60, type: 'cv', target: this.pwmInNode }
        ];

        const availableInputs = {};
        inputPositions.forEach(input => {
            if (input.name === 'PWM' && this.params.waveform !== 'square') {
                // No añadir PWM si no es onda cuadrada
            } else {
                availableInputs[input.name] = {
                    x: 0,
                    y: input.y,
                    type: input.type,
                    target: input.target,
                    orientation: 'horizontal'
                };
            }
        });
        return availableInputs;
    }

    get outputs() {
        return {
            'Out': { x: this.width, y: this.height / 2, type: 'audio', source: this.output, orientation: 'horizontal' }
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

        this.drawKnob(ctx, 'frequency', 'FREQ', this.width / 2, 80, 20, 5000, this.params.frequency, this.activeControl === 'frequency');
        this.drawKnob(ctx, 'detune', 'FINE', this.width / 2, 170, -100, 100, this.params.detune, this.activeControl === 'detune');
        
        if (this.params.waveform === 'square') {
            this.drawKnob(ctx, 'pulseWidth', 'PW', this.width / 2, 260, 0.01, 0.99, this.params.pulseWidth, this.activeControl === 'pulseWidth');
        }
        
        this.drawSelector(ctx, 'waveform', 'WAVE', this.width / 2, 350, 100, 30, this.params.waveform);

        this.drawConnectors(ctx, hoveredConnectorInfo);
        ctx.restore();
    }
    
    drawKnob(ctx, paramName, label, x, y, min, max, value, isActive) {
        const knobRadius = 22;
        const angleRange = Math.PI * 1.5;
        const startAngle = Math.PI * 0.75;
        let normalizedValue = (value - min) / (max - min);
        if (paramName === 'frequency') {
            normalizedValue = (Math.log(value) - Math.log(min)) / (Math.log(max) - Math.log(min));
        }
        const angle = startAngle + normalizedValue * angleRange;
        
        // Visual feedback for active knob
        if (isActive) {
            ctx.beginPath();
            ctx.arc(x, y, knobRadius + 4, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(74, 144, 226, 0.5)';
            ctx.fill();
        }

        ctx.font = '10px Arial'; ctx.fillStyle = '#E0E0E0'; ctx.textAlign = 'center';
        ctx.fillText(label, x, y - knobRadius - 5);
        const displayValue = paramName === 'frequency' ? `${value.toFixed(1)} Hz` : (paramName === 'pulseWidth' ? `${(value * 100).toFixed(0)}%` : `${value.toFixed(0)}c`);
        ctx.fillText(displayValue, x, y + knobRadius + 12);
        ctx.strokeStyle = '#555'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, knobRadius, startAngle, startAngle + angleRange); ctx.stroke();
        ctx.strokeStyle = '#4a90e2'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(angle) * knobRadius, y + Math.sin(angle) * knobRadius); ctx.stroke();
        this.hotspots[paramName] = { x: x - knobRadius, y: y - knobRadius, width: knobRadius * 2, height: knobRadius * 2, min, max, type: 'knob' };
    }
    
    drawSelector(ctx, paramName, label, x, y, w, h, value) {
        ctx.strokeStyle = '#E0E0E0'; ctx.strokeRect(x - w/2, y, w, h);
        ctx.fillStyle = '#E0E0E0'; ctx.font = '10px Arial'; ctx.textAlign = 'center'; ctx.fillText(label, x, y - 5);
        ctx.font = 'bold 12px Arial'; ctx.textBaseline = 'middle';
        // CORRECCIÓN: Aseguramos que 'value' sea un string antes de llamar a toUpperCase()
        ctx.fillText(String(value).toUpperCase(), x, y + h/2);
        this.hotspots[paramName] = { x: x - w/2, y, width: w, height: h, type: 'selector' };
    }
    
    drawConnectors(ctx, hovered) {
        const connectorRadius = 8;
        ctx.font = '10px Arial';

        Object.entries(this.inputs).forEach(([name, props]) => {
            if (this.params.waveform !== 'square' && name === 'PWM') return;
            const ix = props.x;
            const iy = props.y;
            const isHovered = hovered?.module === this && hovered.connector.name === name;
            ctx.beginPath();
            ctx.arc(ix, iy, connectorRadius, 0, Math.PI * 2);
            ctx.fillStyle = isHovered ? 'white' : '#4a90e2';
            ctx.fill();
            ctx.fillStyle = '#E0E0E0';
            ctx.textAlign = 'left';
            ctx.fillText(name.toUpperCase(), ix + connectorRadius + 4, iy + 4);
        });

        Object.entries(this.outputs).forEach(([name, props]) => {
            const ox = props.x;
            const oy = props.y;
            const isHovered = hovered?.module === this && hovered.connector.name === name;
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

    isInside(pos, rect) {
        return pos.x >= rect.x && pos.x <= rect.x + rect.width && pos.y >= rect.y && pos.y <= rect.y + rect.height;
    }

    checkInteraction(pos) {
        const localPos = { x: pos.x - this.x, y: pos.y - this.y };
        for (const [name, spot] of Object.entries(this.hotspots)) {
            if (this.isInside(localPos, spot) && spot.type === 'knob') {
                this.activeControl = name;
                this.dragStartY = localPos.y; // Store initial Y position
                this.dragInitiated = false;
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

    endInteraction() {
        this.activeControl = null;
        this.dragStart = null;
    }

    handleDragInteraction(worldPos) {
        if (!this.activeControl) return;

        const localY = worldPos.y - this.y;

        if (!this.dragStart) {
            // First movement after click
            const dy = Math.abs(localY - this.dragStartY);
            if (dy > this.deadzone) {
                // Exited deadzone, start the drag
                this.dragStart = {
                    y: localY,
                    value: this.params[this.activeControl]
                };
            } else {
                return; // Still in deadzone
            }
        } else {
            // Already dragging
            const hotspot = this.hotspots[this.activeControl];
            const dy = this.dragStart.y - localY;
            let newValue;

            if (this.activeControl === 'frequency') {
                const logRange = Math.log(hotspot.max) - Math.log(hotspot.min);
                const currentNorm = (Math.log(this.dragStart.value) - Math.log(hotspot.min)) / logRange;
                const newNorm = Math.max(0, Math.min(1, currentNorm + dy * 0.005));
                newValue = Math.exp(Math.log(hotspot.min) + newNorm * logRange);
            } else {
                const sensitivity = (hotspot.max - hotspot.min) / 128;
                newValue = this.dragStart.value + dy * sensitivity;
            }
            
            this.params[this.activeControl] = Math.max(hotspot.min, Math.min(hotspot.max, newValue));
            this.updateParams();
        }
    }

    getConnectorAt(x, y) {
        const localX = x - this.x;
        const localY = y - this.y;
        for (const [name, props] of Object.entries(this.inputs)) {
            if (this.params.waveform !== 'square' && name === 'PWM') continue;
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
        this.x = state.x; this.y = state.y;
        // Asegurarse de que la forma de onda sea válida al cargar el estado
        if (state.waveform !== undefined && state.waveform !== null && this.waveforms.includes(state.waveform)) {
            this.params.waveform = state.waveform;
        } else {
            this.params.waveform = 'sawtooth'; // Valor por defecto si es inválido
        }
        // Copiar el resto de los parámetros
        Object.keys(state).forEach(key => {
            if (key !== 'waveform') {
                this.params[key] = state[key];
            }
        });
        this.updateParams();
    }
    disconnect() { this.workletNode?.disconnect(); this.output?.disconnect(); }
}
