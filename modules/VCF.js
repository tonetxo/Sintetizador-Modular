// modules/VCF.js
import { audioContext } from './AudioContext.js';

export class VCF {
    constructor(x, y, id = null, initialState = {}) {
        this.id = id || `vcf-${Date.now()}`;
        this.x = x;
        this.y = y;
        this.width = 180; // Máis ancho
        this.height = 300; // Máis alto
        this.type = 'VCF';

        this.filterTypes = ['lowpass', 'highpass', 'bandpass', 'notch'];
        let initialFilterIndex = this.filterTypes.indexOf(initialState.filterType);
        if (initialFilterIndex === -1) {
            initialFilterIndex = 0; // Default to lowpass if not found
        }
        this.currentFilterIndex = initialFilterIndex;

        this.bypassed = initialState.bypassed || false;

        this.inputGain = audioContext.createGain();
        this.bypassGain = audioContext.createGain();
        this.outputGain = audioContext.createGain();

        this.filter = audioContext.createBiquadFilter();
        this.filter.type = this.filterTypes[this.currentFilterIndex];
        this.filter.frequency.setValueAtTime(initialState.cutoff || 1000, audioContext.currentTime);
        this.filter.Q.setValueAtTime(initialState.resonance || 1, audioContext.currentTime);

        // Create intermediate GainNodes for modulation depth control
        this.frequencyModulator = audioContext.createGain();
        this.QModulator = audioContext.createGain();

        // Set initial modulation depths (these values can be adjusted)
        // These gains now act as the *depth* of modulation
        this.frequencyModulator.gain.value = 5000; // A high value for frequency modulation depth
        this.QModulator.gain.value = 20; // A value for Q modulation depth

        // Connect the output of the modulation gain nodes to the filter's AudioParams
        // The LFO will connect to frequencyModulator, and its output will modulate filter.frequency
        this.frequencyModulator.connect(this.filter.frequency);
        this.QModulator.connect(this.filter.Q);

        this.inputGain.connect(this.filter);
        this.filter.connect(this.outputGain);
        this.bypassGain.connect(this.outputGain);

        this.updateBypassState();
        
        this.activeControl = null;
        this.paramHotspots = {};

        this.inputs = {
            'audio': { x: 0, y: this.height / 2, type: 'audio', target: [this.inputGain, this.bypassGain], orientation: 'horizontal' },
            // The CV input now targets the modulation gain nodes themselves
            'CV 1': { x: this.width / 2 - 40, y: this.height, type: 'cv', target: this.frequencyModulator, orientation: 'vertical' },
            'CV 2': { x: this.width / 2 + 40, y: this.height, type: 'cv', target: this.QModulator, orientation: 'vertical' } // Assuming CV 2 is for Q modulation
        };
        this.outputs = {
            'audio': { x: this.width, y: this.height / 2, type: 'audio', source: this.outputGain, orientation: 'horizontal' }
        };
    }

    toggleBypass() {
        this.bypassed = !this.bypassed;
        this.updateBypassState();
    }

    updateBypassState() {
        if (this.bypassed) {
            this.inputGain.gain.setValueAtTime(0, audioContext.currentTime);
            this.bypassGain.gain.setValueAtTime(1, audioContext.currentTime);
        } else {
            this.inputGain.gain.setValueAtTime(1, audioContext.currentTime);
            this.bypassGain.gain.setValueAtTime(0, audioContext.currentTime);
        }
    }

    draw(ctx, isSelected, hoveredConnectorInfo) {
        ctx.save();
        ctx.translate(this.x, this.y);

        ctx.fillStyle = this.bypassed ? '#555' : '#222';
        ctx.strokeStyle = isSelected ? '#aaffff' : '#E0E0E0';
        ctx.lineWidth = 2;
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.strokeRect(0, 0, this.width, this.height);

        ctx.fillStyle = '#E0E0E0';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('VCF', this.width / 2, 22);

        ctx.font = '10px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(`Cut: ${this.filter.frequency.value.toFixed(0)}Hz`, 10, 40);
        ctx.textAlign = 'right';
        ctx.fillText(`Q: ${this.filter.Q.value.toFixed(2)}`, this.width - 10, 40);

        this.drawVerticalSlider(ctx, 'cutoff', 40, 40, 220, 20, 20000, this.filter.frequency.value, 'Hz', true);
        this.drawVerticalSlider(ctx, 'q', this.width - 40, 40, 220, 0, 30, this.filter.Q.value, false);

        // Dibuja el símbolo del filtro
        this.drawFilterSymbol(ctx, this.width / 2, this.height / 2 + 20, 30);

        ctx.restore();
        this.drawConnectors(ctx, hoveredConnectorInfo);
    }

    drawFilterSymbol(ctx, cx, cy, size) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.strokeStyle = '#E0E0E0';
        ctx.lineWidth = 2;

        const halfSize = size / 2;

        switch (this.filterTypes[this.currentFilterIndex]) {
            case 'lowpass':
                ctx.beginPath();
                ctx.moveTo(-halfSize, halfSize);
                ctx.lineTo(-halfSize, -halfSize);
                ctx.lineTo(halfSize, -halfSize);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(halfSize, -halfSize, 5, 0, Math.PI * 2);
                ctx.fill();
                break;
            case 'highpass':
                ctx.beginPath();
                ctx.moveTo(-halfSize, -halfSize);
                ctx.lineTo(halfSize, -halfSize);
                ctx.lineTo(halfSize, halfSize);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(-halfSize, halfSize, 5, 0, Math.PI * 2);
                ctx.fill();
                break;
            case 'bandpass':
                ctx.beginPath();
                ctx.moveTo(-halfSize, halfSize);
                ctx.lineTo(-halfSize, -halfSize);
                ctx.lineTo(0, halfSize);
                ctx.lineTo(halfSize, -halfSize);
                ctx.lineTo(halfSize, halfSize);
                ctx.stroke();
                break;
            case 'notch':
                ctx.beginPath();
                ctx.moveTo(-halfSize, -halfSize);
                ctx.lineTo(-halfSize, halfSize);
                ctx.moveTo(halfSize, -halfSize);
                ctx.lineTo(halfSize, halfSize);
                ctx.moveTo(-halfSize, 0);
                ctx.lineTo(halfSize, 0);
                ctx.stroke();
                break;
        }
        ctx.restore();
    }

    drawVerticalSlider(ctx, paramName, x, y, height, minVal, maxVal, currentValue, unit, isLogarithmic = false) {
        const knobRadius = 8;

        // Etiqueta
        ctx.fillStyle = '#E0E0E0';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(paramName.toUpperCase(), x, y - 18);

        // Barra del slider
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + height);
        ctx.stroke();

        // Pomo del slider
        let normalizedValue;
        if (isLogarithmic) {
            const logMin = Math.log(minVal);
            const logMax = Math.log(maxVal);
            const logCurrent = Math.log(currentValue);
            normalizedValue = (logCurrent - logMin) / (logMax - logMin);
        } else {
            normalizedValue = (currentValue - minVal) / (maxVal - minVal);
        }
        
        // ** A corrección clave: asegurar que o valor estea sempre entre 0 e 1 **
        normalizedValue = Math.max(0, Math.min(1, normalizedValue));

        const knobY = y + height - (normalizedValue * height);
        ctx.beginPath();
        ctx.arc(x, knobY, knobRadius, 0, Math.PI * 2);
        ctx.fillStyle = this.activeControl === paramName ? '#aaffff' : '#4a90e2';
        ctx.fill();
        ctx.strokeStyle = '#E0E0E0';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Valor
        ctx.fillText(`${currentValue.toFixed(1)}${unit}`, x, y + height + 15);

        // Guardar hotspot para interacción
        this.paramHotspots[paramName] = {
            x: x - knobRadius,
            y: y,
            width: knobRadius * 2,
            height: height,
            min: minVal,
            max: maxVal,
            isLog: isLogarithmic
        };
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
            ctx.fillStyle = '#E0E0E0';
            if (name === 'audio') {
                ctx.textAlign = 'left';
                ctx.fillText('ENTRADA', x + connectorRadius + 4, y + 4);
            } else {
                ctx.textAlign = 'center';
                ctx.fillText(name, x, y + connectorRadius + 12);
            }
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

    checkInteraction(pos) {
        const localPos = { x: pos.x - this.x, y: pos.y - this.y };
        // Check for filter type click area
        const symbolCenterX = this.width / 2;
        const symbolCenterY = this.height / 2 + 20;
        const clickRadius = 25; // Adjust as needed
        if (Math.hypot(localPos.x - symbolCenterX, localPos.y - symbolCenterY) < clickRadius) {
            this.handleClick();
            return true;
        }

        for (const [param, rect] of Object.entries(this.paramHotspots)) {
            if (localPos.x >= rect.x && localPos.x <= rect.x + rect.width &&
                localPos.y >= rect.y && localPos.y <= rect.y + rect.height) {
                this.activeControl = param;
                return true;
            }
        }
        return false;
    }

    handleClick() {
        this.currentFilterIndex = (this.currentFilterIndex + 1) % this.filterTypes.length;
        this.filter.type = this.filterTypes[this.currentFilterIndex];
    }

    handleDragInteraction(worldPos) {
        if (!this.activeControl) return;

        const localY = worldPos.y - this.y;
        const sliderRect = this.paramHotspots[this.activeControl];
        
        let normalizedValue = (sliderRect.y + sliderRect.height - localY) / sliderRect.height;
        normalizedValue = Math.max(0, Math.min(1, normalizedValue));

        const now = audioContext.currentTime;
        const rampTime = 0.02;

        if (this.activeControl === 'cutoff') {
            const minFreq = sliderRect.min;
            const maxFreq = sliderRect.max;
            const logMin = Math.log(minFreq);
            const logMax = Math.log(maxFreq);
            
            const logNew = logMin + normalizedValue * (logMax - logMin);
            const newFreq = Math.exp(logNew);
            
            this.filter.frequency.cancelScheduledValues(now);
            this.filter.frequency.setValueAtTime(this.filter.frequency.value, now);
            this.filter.frequency.linearRampToValueAtTime(Math.max(minFreq, Math.min(maxFreq, newFreq)), now + rampTime);

        } else if (this.activeControl === 'q') {
            const minQ = sliderRect.min;
            const maxQ = sliderRect.max;
            const newQ = minQ + normalizedValue * (maxQ - minQ);

            this.filter.Q.cancelScheduledValues(now);
            this.filter.Q.setValueAtTime(this.filter.Q.value, now);
            this.filter.Q.linearRampToValueAtTime(Math.max(minQ, Math.min(maxQ, newQ)), now + rampTime);
        }
    }

    endInteraction() {
        this.activeControl = null;
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
        this.filter.disconnect();
    }

    getState() {
        return {
            id: this.id,
            type: 'VCF',
            x: this.x, y: this.y,
            cutoff: this.filter.frequency.value,
            resonance: this.filter.Q.value,
            filterType: this.filterTypes[this.currentFilterIndex],
            bypassed: this.bypassed
        };
    }

    setState(state) {
        this.id = state.id || this.id;
        this.x = state.x; this.y = state.y;
        this.filter.frequency.setValueAtTime(state.cutoff, audioContext.currentTime);
        this.filter.Q.setValueAtTime(state.resonance, audioContext.currentTime);
        this.currentFilterIndex = this.filterTypes.indexOf(state.filterType) !== -1 ? this.filterTypes.indexOf(state.filterType) : 0;
        this.filter.type = this.filterTypes[this.currentFilterIndex];
        this.bypassed = state.bypassed || false;
        this.updateBypassState();
    }
}