// src/modules/audio/modulators/ADSR.js

export class ADSR {
    constructor(audioContext, x, y, id = null, initialState = {}) {
        this.audioContext = audioContext;
        this.id = id || `adsr-${Date.now()}`;
        this.x = x;
        this.y = y;
        this.width = 220;
        this.height = 300;
        this.type = 'ADSR';

        this.params = {
            attack: initialState.attack || 0.01,
            decay: initialState.decay || 0.1,
            sustain: initialState.sustain || 0.8,
            release: initialState.release || 0.2
        };

        this.activeControl = null;
        this.paramHotspots = {};
        this.dragStart = {};
        
        // --- CORRECCIÓN: Definir los puertos ANTES de llamar a initWorklet ---
        this.inputs = {
            'Gate': { x: 0, y: this.height / 2, type: 'gate', target: null }
        };
        this.outputs = {
            'CV': { x: this.width, y: this.height / 2, type: 'cv', source: null }
        };

        this.workletNode = null;
        this.readyPromise = this.initWorklet();
    }

    async initWorklet() {
        try {
            this.workletNode = new AudioWorkletNode(this.audioContext, 'adsr-processor');
            
            // Ahora this.inputs y this.outputs existen y son seguros de usar
            this.inputs.Gate.target = this.workletNode;
            this.outputs.CV.source = this.workletNode;

            this.attackParam = this.workletNode.parameters.get('attack');
            this.decayParam = this.workletNode.parameters.get('decay');
            this.sustainParam = this.workletNode.parameters.get('sustain');
            this.releaseParam = this.workletNode.parameters.get('release');
            
            this.updateAudioParams();
        } catch (err) {
            console.error(`[ADSR-${this.id}] Initialization error:`, err);
        }
    }

    updateAudioParams() {
        if (!this.workletNode) return;
        const now = this.audioContext.currentTime;
        this.attackParam.setValueAtTime(this.params.attack, now);
        this.decayParam.setValueAtTime(this.params.decay, now);
        this.sustainParam.setValueAtTime(this.params.sustain, now);
        this.releaseParam.setValueAtTime(this.params.release, now);
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
        
        this.drawVerticalSlider(ctx, 'attack', 40, 60, 200, 0.001, 2, this.params.attack, 's');
        this.drawVerticalSlider(ctx, 'decay', 90, 60, 200, 0.001, 2, this.params.decay, 's');
        this.drawVerticalSlider(ctx, 'sustain', 140, 60, 200, 0, 1, this.params.sustain, '');
        this.drawVerticalSlider(ctx, 'release', 190, 60, 200, 0.001, 5, this.params.release, 's');

        this.drawConnectors(ctx, hoveredConnectorInfo);
        ctx.restore();
    }
  
    drawVerticalSlider(ctx, paramName, x, y, height, minVal, maxVal, currentValue, unit) {
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
        let normalizedValue = (currentValue - minVal) / (maxVal - minVal);
        normalizedValue = Math.max(0, Math.min(1, normalizedValue));
        const knobY = y + height - (normalizedValue * height);
        ctx.beginPath();
        ctx.arc(x, knobY, knobRadius, 0, Math.PI * 2);
        ctx.fillStyle = this.activeControl === paramName ? '#aaffff' : '#4a90e2';
        ctx.fill();
        this.paramHotspots[paramName] = { x: x - knobRadius, y: y, width: knobRadius * 2, height: height, min: minVal, max: maxVal };
    }

    drawConnectors(ctx, hovered) {
        const connectorRadius = 8;
        ctx.font = '10px Arial';
        Object.entries(this.inputs).forEach(([name, props]) => {
            const ix = props.x, iy = props.y;
            const isHovered = hovered?.module === this && hovered.connector?.name === name;
            ctx.beginPath(); ctx.arc(ix, iy, connectorRadius, 0, Math.PI * 2);
            ctx.fillStyle = isHovered ? 'white' : '#4a90e2'; ctx.fill();
            ctx.fillStyle = '#E0E0E0'; ctx.textAlign = 'left';
            ctx.fillText(name.toUpperCase(), ix + connectorRadius + 4, iy + 4);
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
        const dy = this.dragStart.y - worldPos.y;
        const sensitivity = (sliderRect.max - sliderRect.min) / 128;
        let newValue = this.dragStart.value + dy * sensitivity;
        newValue = Math.max(sliderRect.min, Math.min(sliderRect.max, newValue));
        this.params[this.activeControl] = newValue;
      
        if(this.workletNode) {
            const param = this.workletNode.parameters.get(this.activeControl);
            param.setTargetAtTime(newValue, this.audioContext.currentTime, 0.01);
        }
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
    
    getState() { return { id: this.id, type: this.type, x: this.x, y: this.y, ...this.params }; }
  
    setState(state) {
        this.id = state.id || this.id;
        this.x = state.x ?? this.x;
        this.y = state.y ?? this.y;
        Object.keys(this.params).forEach(key => {
            if (state[key] !== undefined) this.params[key] = state[key];
        });
        this.updateAudioParams();
    }
  
    disconnect() { this.workletNode?.disconnect(); }
}