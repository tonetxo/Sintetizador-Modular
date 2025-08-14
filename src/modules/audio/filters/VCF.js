// src/modules/audio/filters/VCF.js

export class VCF {
    constructor(audioContext, x, y, id = null, initialState = {}) {
        this.audioContext = audioContext;
        this.id = id || `vcf-${Date.now()}`;
        this.x = x;
        this.y = y;
        this.width = 180;
        this.height = 300;
        this.type = 'VCF';

        // --- ESTADO INTERNO PARA PARÁMETROS ---
        this.params = {
            cutoff: initialState.cutoff || 1000,
            q: initialState.resonance || 1,
            filterType: initialState.filterType || 'lowpass'
        };

        this.filterTypes = ['lowpass', 'highpass', 'bandpass', 'notch'];
        
        // NODOS DE AUDIO
        this.inputGain = this.audioContext.createGain();
        this.outputGain = this.audioContext.createGain();
        this.filter = this.audioContext.createBiquadFilter();
        
        this.inputGain.connect(this.filter);
        this.filter.connect(this.outputGain);

        this.frequencyModulator = this.audioContext.createGain();
        this.frequencyModulator.gain.value = 5000; // Profundidad de modulación por defecto
        this.frequencyModulator.connect(this.filter.frequency);
        
        this.qModulator = this.audioContext.createGain();
        this.qModulator.gain.value = 20; // Profundidad de modulación por defecto
        this.qModulator.connect(this.filter.Q);

        // ESTADO DE INTERACCIÓN
        this.activeControl = null;
        this.paramHotspots = {};
        this.dragStart = {};

        // PUERTOS
        this.inputs = {
            'Audio In': { x: 0, y: this.height / 2, type: 'audio', target: this.inputGain },
            'Freq CV': { x: 40, y: this.height, type: 'cv', target: this.frequencyModulator },
            'Q CV': { x: this.width - 40, y: this.height, type: 'cv', target: this.qModulator }
        };
        this.outputs = {
            'Audio Out': { x: this.width, y: this.height / 2, type: 'audio', source: this.outputGain }
        };
        
        this.updateAudioParams(); // Sincroniza los nodos de audio con el estado inicial
    }
    
    updateAudioParams() {
        const now = this.audioContext.currentTime;
        this.filter.frequency.setValueAtTime(this.params.cutoff, now);
        this.filter.Q.setValueAtTime(this.params.q, now);
        this.filter.type = this.params.filterType;
    }

    handleClick(x, y) {
        const localPos = { x: x - this.x, y: y - this.y };
        const symbolRect = { x: this.width / 2 - 25, y: this.height / 2 - 25, width: 50, height: 50 };

        if (localPos.x >= symbolRect.x && localPos.x <= symbolRect.x + symbolRect.width &&
            localPos.y >= symbolRect.y && localPos.y <= symbolRect.y + symbolRect.height) {
            const currentIndex = this.filterTypes.indexOf(this.params.filterType);
            this.params.filterType = this.filterTypes[(currentIndex + 1) % this.filterTypes.length];
            this.filter.type = this.params.filterType;
            return true;
        }
        return false;
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
        ctx.fillText('VCF', this.width / 2, 22);

        this.drawVerticalSlider(ctx, 'cutoff', 40, 60, 200, 20, 20000, this.params.cutoff, 'Hz', true);
        this.drawVerticalSlider(ctx, 'q', this.width - 40, 60, 200, 0.1, 30, this.params.q, '', false);

        this.drawFilterSymbol(ctx, this.width / 2, this.height / 2, 40);
        this.drawConnectors(ctx, hoveredConnectorInfo);
        ctx.restore();
    }

    drawFilterSymbol(ctx, cx, cy, size) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.strokeStyle = '#E0E0E0';
        ctx.lineWidth = 2;
        const halfSize = size / 2;
        ctx.beginPath();
        switch (this.params.filterType) {
            case 'lowpass': ctx.moveTo(-halfSize, -halfSize); ctx.lineTo(0, -halfSize); ctx.lineTo(halfSize, halfSize); break;
            case 'highpass': ctx.moveTo(-halfSize, halfSize); ctx.lineTo(0, halfSize); ctx.lineTo(halfSize, -halfSize); break;
            case 'bandpass': ctx.moveTo(-halfSize, halfSize); ctx.lineTo(-halfSize/2, -halfSize); ctx.lineTo(halfSize/2, -halfSize); ctx.lineTo(halfSize, halfSize); ctx.closePath(); break;
            case 'notch': ctx.moveTo(-halfSize, -halfSize); ctx.lineTo(-halfSize/2, halfSize); ctx.lineTo(halfSize/2, halfSize); ctx.lineTo(halfSize, -halfSize); ctx.closePath(); break;
        }
        ctx.stroke();
        ctx.restore();
    }

    drawVerticalSlider(ctx, paramName, x, y, height, minVal, maxVal, currentValue, unit, isLogarithmic) {
        const knobRadius = 8;
        ctx.font = '10px Arial';
        ctx.fillStyle = '#E0E0E0';
        ctx.textAlign = 'center';
        ctx.fillText(paramName.toUpperCase(), x, y - 5);
        ctx.fillText(currentValue.toFixed(paramName === 'q' ? 1 : 0) + (unit || ''), x, y + height + 15);
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + height);
        ctx.stroke();
        let normalizedValue;
        if (isLogarithmic) {
            normalizedValue = (Math.log(currentValue) - Math.log(minVal)) / (Math.log(maxVal) - Math.log(minVal));
        } else {
            normalizedValue = (currentValue - minVal) / (maxVal - minVal);
        }
        normalizedValue = Math.max(0, Math.min(1, normalizedValue));
        const knobY = y + height - (normalizedValue * height);
        ctx.beginPath();
        ctx.arc(x, knobY, knobRadius, 0, Math.PI * 2);
        ctx.fillStyle = this.activeControl === paramName ? '#aaffff' : '#4a90e2';
        ctx.fill();
        this.paramHotspots[paramName] = { x: x - knobRadius, y: y, width: knobRadius * 2, height: height, min: minVal, max: maxVal, isLog: isLogarithmic };
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
            ctx.textAlign = name.includes('CV') ? 'center' : 'left';
            const labelX = name.includes('CV') ? ix : ix + connectorRadius + 4;
            const labelY = name.includes('CV') ? iy + connectorRadius + 12 : iy + 4;
            ctx.fillText(name, labelX, labelY);
        });
        Object.entries(this.outputs).forEach(([name, props]) => {
            const ox = props.x, oy = props.y;
            const isHovered = hovered?.module === this && hovered.connector?.name === name;
            ctx.beginPath(); ctx.arc(ox, oy, connectorRadius, 0, Math.PI * 2);
            ctx.fillStyle = isHovered ? 'white' : '#222'; ctx.fill();
            ctx.strokeStyle = '#4a90e2'; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.fillStyle = '#E0E0E0'; ctx.textAlign = 'right';
            ctx.fillText(name, ox - connectorRadius - 4, oy + 4);
        });
    }

    checkInteraction(pos) {
        const localPos = { x: pos.x - this.x, y: pos.y - this.y };
        for (const [param, rect] of Object.entries(this.paramHotspots)) {
            if (localPos.x >= rect.x && localPos.x <= rect.x + rect.width &&
                localPos.y >= rect.y && localPos.y <= rect.y + rect.height) {
                this.activeControl = param;
                this.dragStart = { y: pos.y, value: this.params[param] };
                return true;
            }
        }
        return false;
    }

    handleDragInteraction(worldPos) {
        if (!this.activeControl) return;
        const sliderRect = this.paramHotspots[this.activeControl];
        const localY = worldPos.y - this.y;
        let normVal = (sliderRect.y + sliderRect.height - localY) / sliderRect.height;
        normVal = Math.max(0, Math.min(1, normVal));
        
        let newValue;
        if (sliderRect.isLog) {
            newValue = Math.exp(Math.log(sliderRect.min) + normVal * (Math.log(sliderRect.max) - Math.log(sliderRect.min)));
        } else {
            newValue = sliderRect.min + normVal * (sliderRect.max - sliderRect.min);
        }
        
        this.params[this.activeControl] = newValue;
        const targetParam = this.activeControl === 'cutoff' ? this.filter.frequency : this.filter.Q;
        targetParam.setTargetAtTime(newValue, this.audioContext.currentTime, 0.01);
    }
    
    endInteraction() { this.activeControl = null; }

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
            id: this.id, type: 'VCF', x: this.x, y: this.y,
            cutoff: this.params.cutoff,
            resonance: this.params.q,
            filterType: this.params.filterType
        };
    }

    setState(state) {
        this.id = state.id || this.id;
        this.x = state.x ?? this.x;
        this.y = state.y ?? this.y;
        this.params.cutoff = state.cutoff || 1000;
        this.params.q = state.resonance || 1;
        this.params.filterType = this.filterTypes.includes(state.filterType) ? state.filterType : 'lowpass';
        this.updateAudioParams();
    }
    
    disconnect() {
        this.inputGain.disconnect();
        this.outputGain.disconnect();
        this.filter.disconnect();
        this.frequencyModulator.disconnect();
        this.qModulator.disconnect();
    }
}