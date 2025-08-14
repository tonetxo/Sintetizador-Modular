// src/modules/audio/GranularSampler.js
export class GranularSampler {
    constructor(audioContext, x, y, id = null, initialState = {}) {
        this.audioContext = audioContext;
        this.id = id || `granular-${Date.now()}`;
        this.x = x;
        this.y = y;
        this.width = 250;
        this.height = 340; // Aumentamos la altura para el nuevo control
        this.type = 'GranularSampler';

        this.workletNode = null;
        this.isInitialized = false;

        this.splitterNode = this.audioContext.createChannelSplitter(2);
        this.output = this.audioContext.createGain();
        this.splitterNode.connect(this.output);

        // --- CORRECCIÓN DEL ERROR DEL LOG ---
        // Se definen primero los parámetros por defecto.
        const defaultParams = {
            position: 0.5, grainSize: 0.1, grainRate: 20,
            pitch: 1.0, spread: 0.1, randomness: 0.0,
            pitchShift: false,
            stereoSpread: 0.5,
        };
        // Luego, se fusionan con cualquier estado inicial que se haya cargado.
        this.params = { ...defaultParams, ...(initialState.params || {}) };
        
        this.paramHotspots = {};
        this.activeControl = null;
        this.dragStart = {};

        this.inputs = {
            'Pos': { x: 0, y: 50, type: 'cv' },
            'Size': { x: 0, y: 80, type: 'cv' },
            'Rate': { x: 0, y: 110, type: 'cv' },
            'Pitch': { x: 0, y: 140, type: 'cv' },
        };
        this.outputs = {
            'Out L': { x: this.width, y: this.height / 2 - 20, type: 'audio', source: this.splitterNode, channel: 0 },
            'Out R': { x: this.width, y: this.height / 2 + 20, type: 'audio', source: this.splitterNode, channel: 1 }
        };
        
        this.audioBuffer = null;
        this.readyPromise = this.initWorklet();
    }

    async initWorklet() {
        if (this.isInitialized) return;
        try {
            this.workletNode = new AudioWorkletNode(this.audioContext, 'granular-processor', {
                outputChannelCount: [2]
            });
            this.workletNode.connect(this.splitterNode);
            
            this.inputs.Pos.target = this.workletNode.parameters.get('position');
            this.inputs.Size.target = this.workletNode.parameters.get('grainSize');
            this.inputs.Rate.target = this.workletNode.parameters.get('grainRate');
            this.inputs.Pitch.target = this.workletNode.parameters.get('pitch');
            
            this.isInitialized = true;
            this.updateParams();
        } catch (error) {
            console.error(`[GranularSampler ${this.id}] Failed to initialize worklet:`, error);
        }
    }
    
    updateParams() {
        if (!this.isInitialized) return;
        for(const [name, value] of Object.entries(this.params)) {
            const param = this.workletNode.parameters.get(name);
            if(param) {
                const paramValue = name === 'pitchShift' ? (value ? 1 : 0) : value;
                param.setValueAtTime(paramValue, this.audioContext.currentTime);
            }
        }
    }
    
    setParameter(param, value) {
        if (this.params[param] !== undefined) {
            this.params[param] = value;
            this.updateParams();
        }
    }

    async loadDecodedData(audioBuffer) {
        if (!this.isInitialized) await this.readyPromise;
        if (!this.workletNode) return false;
        
        this.audioBuffer = audioBuffer;
        const channelData = audioBuffer.getChannelData(0);
        this.workletNode.port.postMessage(
            { type: 'audioBuffer', buffer: channelData },
            [channelData.buffer]
        );
        return true;
    }
    
    handleClick(x, y) {
        const local = {x: x - this.x, y: y - this.y};
        const loadBtn = {x: 10, y: this.height - 40, w: 110, h: 30};
        const pitchShiftBtn = {x: 130, y: this.height - 40, w: 110, h: 30};

        if (local.y > loadBtn.y && local.y < loadBtn.y + loadBtn.h) {
            if (local.x > loadBtn.x && local.x < loadBtn.x + loadBtn.w) {
                window.api.requestAudioFile(this.id);
                return true;
            }
            if (local.x > pitchShiftBtn.x && local.x < pitchShiftBtn.x + pitchShiftBtn.w) {
                this.params.pitchShift = !this.params.pitchShift;
                this.updateParams();
                return true;
            }
        }
        return false;
    }

    draw(ctx, isSelected, hoveredConnector) {
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
        ctx.fillText('GRANULAR', this.width / 2, 22);

        this.drawVerticalSlider(ctx, 'position', 170, 40, 180, 0, 1, this.params.position, 'POS');
        this.drawVerticalSlider(ctx, 'grainSize', 210, 40, 180, 0.01, 0.5, this.params.grainSize, 'SIZE');
        this.drawVerticalSlider(ctx, 'stereoSpread', 130, 40, 180, 0, 1, this.params.stereoSpread, 'SPREAD');

        const loadBtn = {x: 10, y: this.height - 40, w: 110, h: 30};
        ctx.fillStyle = '#333';
        ctx.fillRect(loadBtn.x, loadBtn.y, loadBtn.w, loadBtn.h);
        ctx.fillStyle = '#E0E0E0';
        ctx.font = 'bold 12px Arial';
        ctx.fillText(this.audioBuffer ? 'AUDIO LOADED' : 'LOAD AUDIO', loadBtn.x + loadBtn.w/2, loadBtn.y + 19);
        
        const pitchShiftBtn = {x: 130, y: this.height - 40, w: 110, h: 30};
        ctx.fillStyle = this.params.pitchShift ? '#4a90e2' : '#333';
        ctx.fillRect(pitchShiftBtn.x, pitchShiftBtn.y, pitchShiftBtn.w, pitchShiftBtn.h);
        ctx.fillStyle = '#E0E0E0';
        ctx.font = 'bold 12px Arial';
        ctx.fillText('PITCH SHIFT', pitchShiftBtn.x + pitchShiftBtn.w/2, pitchShiftBtn.y + 19);

        this.drawConnectors(ctx, hoveredConnector);
        ctx.restore();
    }
    
    drawVerticalSlider(ctx, param, x, y, h, min, max, val, label) {
        const knobRadius = 8;
        ctx.font = '10px Arial';
        ctx.fillStyle = '#E0E0E0';
        ctx.textAlign = 'center';
        ctx.fillText(label, x, y - 5);
        // Añadimos una comprobación de seguridad para evitar el error si val es undefined
        const displayValue = (typeof val === 'number') ? val.toFixed(2) : '---';
        ctx.fillText(displayValue, x, y + h + 15);
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + h);
        ctx.stroke();
        const norm = (val - min) / (max - min);
        const knobY = y + h - (norm * h);
        ctx.beginPath();
        ctx.arc(x, knobY, knobRadius, 0, Math.PI * 2);
        ctx.fillStyle = this.activeControl === param ? '#aaffff' : '#4a90e2';
        ctx.fill();
        this.paramHotspots[param] = { x: x - knobRadius, y, width: knobRadius * 2, height: h, min, max };
    }
    
    drawConnectors(ctx, hovered) {
        const r = 8;
        ctx.font = '10px Arial';
        Object.entries(this.inputs).forEach(([name, props]) => {
            const isHovered = hovered?.module === this && hovered.connector?.name === name;
            ctx.beginPath(); ctx.arc(props.x, props.y, r, 0, 2 * Math.PI);
            ctx.fillStyle = isHovered ? 'white' : '#4a90e2'; ctx.fill();
            ctx.fillStyle = '#E0E0E0'; ctx.textAlign = 'left';
            ctx.fillText(name, props.x + r + 4, props.y + 4);
        });
        Object.entries(this.outputs).forEach(([name, props]) => {
            const isHovered = hovered?.module === this && hovered.connector?.name === name;
            ctx.beginPath(); ctx.arc(props.x, props.y, r, 0, 2 * Math.PI);
            ctx.fillStyle = isHovered ? 'white' : '#222'; ctx.fill();
            ctx.strokeStyle = '#4a90e2'; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.fillStyle = '#E0E0E0'; ctx.textAlign = 'right';
            ctx.fillText(name, props.x - r - 4, props.y + 4);
        });
    }

    getConnectorAt(x, y) {
        const local = { x: x - this.x, y: y - this.y };
        for (const [name, props] of Object.entries(this.inputs)) {
            if (Math.hypot(local.x - props.x, local.y - props.y) < 9) return { name, type: 'input', props, module: this };
        }
        for (const [name, props] of Object.entries(this.outputs)) {
            if (Math.hypot(local.x - props.x, local.y - props.y) < 9) return { name, type: 'output', props, module: this };
        }
        return null;
    }
    
    checkInteraction(pos) {
        const local = { x: pos.x - this.x, y: pos.y - this.y };
        for (const [param, rect] of Object.entries(this.paramHotspots)) {
            if (local.x > rect.x && local.x < rect.x + rect.width &&
                local.y > rect.y && local.y < rect.y + rect.height) {
                this.activeControl = param;
                this.dragStart = { y: pos.y, value: this.params[param] };
                return true;
            }
        }
        return false;
    }

    handleDragInteraction(worldPos) {
        if (!this.activeControl) return;
        const rect = this.paramHotspots[this.activeControl];
        const localY = worldPos.y - this.y;
        let norm = (rect.y + rect.height - localY) / rect.height;
        norm = Math.max(0, Math.min(1, norm));
        const newValue = rect.min + norm * (rect.max - rect.min);
        this.setParameter(this.activeControl, newValue);
    }
    
    endInteraction() { this.activeControl = null; }

    getState() { return { id: this.id, type: this.type, x: this.x, y: this.y, params: this.params }; }
    
    setState(state) {
        this.x = state.x ?? this.x;
        this.y = state.y ?? this.y;
        if (state.params) {
            this.params = { ...this.params, ...state.params };
        }
        this.updateParams();
    }

    destroy() {
        this.workletNode?.disconnect();
        this.splitterNode?.disconnect();
        this.output.disconnect();
    }
}