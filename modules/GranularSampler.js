// modules/GranularSampler.js
import { audioContext } from './AudioContext.js';

export class GranularSampler {
    constructor(x, y, id = null, initialState = {}) {
        this.id = id || `granular-${Date.now()}`;
        this.type = 'GranularSampler';
        this.x = x;
        this.y = y;
        this.width = 300;
        this.height = 450;
        
        this.audioFilePath = initialState.audioFilePath || null;
        this.audioBuffer = null; // Para dibujar la forma de onda

        this.params = {
            position: initialState.position || 0.5,
            grainSize: initialState.grainSize || 0.1,
            grainRate: initialState.grainRate || 20,
            pitch: initialState.pitch || 1.0,
            jitter: initialState.jitter || 0.0,
        };

        this.activeControl = null;
        this.hotspots = {};
        
        this.readyPromise = this.initWorklet(initialState);
    }

    async initWorklet(initialState) {
        try {
            this.workletNode = new AudioWorkletNode(audioContext, 'granular-processor');
            this.output = this.workletNode;

            // Guardar referencias a los AudioParams
            this.positionParam = this.workletNode.parameters.get('position');
            this.grainSizeParam = this.workletNode.parameters.get('grainSize');
            this.grainRateParam = this.workletNode.parameters.get('grainRate');
            this.pitchParam = this.workletNode.parameters.get('pitch');
            this.jitterParam = this.workletNode.parameters.get('jitter');
            this.triggerParam = this.workletNode.parameters.get('trigger');

            this.inputs = {
                'Pos': { x: 0, y: 100, type: 'cv', target: this.positionParam },
                'Size': { x: 0, y: 160, type: 'cv', target: this.grainSizeParam },
                'Rate': { x: 0, y: 220, type: 'cv', target: this.grainRateParam },
                'Pitch': { x: 0, y: 280, type: 'cv', target: this.pitchParam },
                'Gate': { x: 0, y: 340, type: 'gate', target: this.triggerParam },
            };
            this.outputs = {
                'Out': { x: this.width, y: this.height / 2, type: 'audio', source: this.output },
            };

            this.setState(initialState); // Aplicar estado inicial, incluyendo la carga de audio si existe

        } catch (error) {
            console.error(`[GranularSampler-${this.id}] Error initializing worklet:`, error);
        }
    }
    
    // Este método será llamado desde renderer.js cuando el audio esté decodificado
    loadDecodedData({ decodedData }) {
        if (this.workletNode && decodedData.channelData[0]) {
            const audioData = decodedData.channelData[0]; // Usamos solo el canal izquierdo
            this.audioBuffer = audioData; // Guardar para dibujar
            
            // Enviamos el buffer al worklet. El segundo argumento lo transfiere sin copiarlo (más rápido).
            this.workletNode.port.postMessage(
                { type: 'audioBuffer', buffer: audioData },
                [audioData.buffer]
            );
        }
    }

    updateParams() {
        if (!this.workletNode) return;
        this.positionParam.setTargetAtTime(this.params.position, audioContext.currentTime, 0.01);
        this.grainSizeParam.setTargetAtTime(this.params.grainSize, audioContext.currentTime, 0.01);
        this.grainRateParam.setTargetAtTime(this.params.grainRate, audioContext.currentTime, 0.01);
        this.pitchParam.setTargetAtTime(this.params.pitch, audioContext.currentTime, 0.01);
        this.jitterParam.setTargetAtTime(this.params.jitter, audioContext.currentTime, 0.01);
    }

    draw(ctx, isSelected) {
        ctx.save();
        ctx.translate(this.x, this.y);

        // Dibuja el cuerpo del módulo
        ctx.fillStyle = '#222';
        ctx.strokeStyle = isSelected ? '#aaffff' : '#E0E0E0';
        ctx.lineWidth = 2;
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.strokeRect(0, 0, this.width, this.height);
        ctx.fillStyle = '#E0E0E0';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('GRANULAR SAMPLER', this.width / 2, 22);

        // Dibuja la pantalla para la forma de onda
        const displayRect = { x: 15, y: 40, width: this.width - 30, height: 80 };
        ctx.fillStyle = '#111';
        ctx.fillRect(displayRect.x, displayRect.y, displayRect.width, displayRect.height);
        if (this.audioBuffer) {
            this.drawWaveform(ctx, displayRect);
        } else {
            ctx.fillStyle = '#555';
            ctx.font = '12px Arial';
            ctx.fillText('Carga un sample', this.width / 2, displayRect.y + displayRect.height / 2);
        }
        ctx.strokeStyle = '#555';
        ctx.strokeRect(displayRect.x, displayRect.y, displayRect.width, displayRect.height);

        // Dibuja los knobs
        let yPos = 160;
        this.drawKnob(ctx, 'position', 'POS', this.width / 2, yPos, 0, 1, this.params.position, this.activeControl === 'position');
        yPos += 70;
        this.drawKnob(ctx, 'grainSize', 'SIZE', this.width / 2, yPos, 0.005, 0.5, this.params.grainSize, this.activeControl === 'grainSize');
        yPos += 70;
        this.drawKnob(ctx, 'grainRate', 'RATE', this.width / 2, yPos, 1, 100, this.params.grainRate, this.activeControl === 'grainRate');
        yPos += 70;
        this.drawKnob(ctx, 'pitch', 'PITCH', this.width / 2, yPos, 0.1, 4, this.params.pitch, this.activeControl === 'pitch');
        
        // Dibuja los conectores
        this.drawConnectors(ctx);
        ctx.restore();
    }

    drawWaveform(ctx, rect) {
        ctx.strokeStyle = '#4a90e2';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const step = Math.ceil(this.audioBuffer.length / rect.width);
        for (let i = 0; i < rect.width; i++) {
            let min = 1.0;
            let max = -1.0;
            for (let j = 0; j < step; j++) {
                const datum = this.audioBuffer[(i * step) + j];
                if (datum < min) min = datum;
                if (datum > max) max = datum;
            }
            const x = rect.x + i;
            const y_max = rect.y + (1 - max) * rect.height / 2;
            const y_min = rect.y + (1 - min) * rect.height / 2;
            ctx.moveTo(x, y_max);
            ctx.lineTo(x, y_min);
        }
        ctx.stroke();
        
        // Indicador de posición
        const indicatorX = rect.x + this.params.position * rect.width;
        ctx.strokeStyle = '#ffffaa';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(indicatorX, rect.y);
        ctx.lineTo(indicatorX, rect.y + rect.height);
        ctx.stroke();
    }

    // Copia los métodos de dibujo de knobs, conectores y manejo de interacciones de otros módulos
    // (drawKnob, drawConnectors, checkInteraction, handleDragInteraction, endInteraction, getConnectorAt, etc.)
    // ...
    drawKnob(ctx, paramName, label, x, y, min, max, value, isActive) {
        const knobRadius = 22;
        const angleRange = Math.PI * 1.5;
        const startAngle = Math.PI * 0.75;
        let normalizedValue = (value - min) / (max - min);
        const angle = startAngle + normalizedValue * angleRange;
        
        if (isActive) {
            ctx.beginPath();
            ctx.arc(x, y, knobRadius + 4, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
            ctx.fill();
        }

        ctx.font = '10px Arial'; ctx.fillStyle = '#E0E0E0'; ctx.textAlign = 'center';
        ctx.fillText(label, x, y - knobRadius - 5);
        ctx.fillText(value.toFixed(2), x, y + knobRadius + 12);
        
        ctx.strokeStyle = '#555'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, knobRadius, startAngle, startAngle + angleRange); ctx.stroke();
        ctx.strokeStyle = isActive ? '#ffffaa' : '#4a90e2';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(angle) * knobRadius, y + Math.sin(angle) * knobRadius); ctx.stroke();
        
        this.hotspots[paramName] = { x: x - knobRadius, y: y - knobRadius, width: knobRadius * 2, height: knobRadius * 2, min, max, type: 'knob' };
    }

    drawConnectors(ctx) {
        if (!this.inputs || !this.outputs) return;
        const connectorRadius = 8;
        ctx.font = '10px Arial';

        Object.entries(this.inputs).forEach(([name, props]) => {
            const ix = props.x, iy = props.y;
            ctx.beginPath(); ctx.arc(ix, iy, connectorRadius, 0, Math.PI * 2);
            ctx.fillStyle = '#4a90e2'; ctx.fill();
            ctx.fillStyle = '#E0E0E0'; ctx.textAlign = 'left';
            ctx.fillText(name, ix + connectorRadius + 4, iy + 4);
        });

        Object.entries(this.outputs).forEach(([name, props]) => {
            const ox = props.x, oy = props.y;
            ctx.beginPath(); ctx.arc(ox, oy, connectorRadius, 0, Math.PI * 2);
            ctx.fillStyle = '#222'; ctx.fill();
            ctx.strokeStyle = '#4a90e2'; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.fillStyle = '#E0E0E0'; ctx.textAlign = 'right';
            ctx.fillText(name, ox - connectorRadius - 4, oy + 4);
        });
    }

    checkInteraction(pos) {
        const localPos = { x: pos.x - this.x, y: pos.y - this.y };
        for (const [name, spot] of Object.entries(this.hotspots)) {
            if (pos.x >= this.x + spot.x && pos.x <= this.x + spot.x + spot.width &&
                pos.y >= this.y + spot.y && pos.y <= this.y + spot.y + spot.height) {
                this.activeControl = name;
                this.dragStart = { y: localPos.y, value: this.params[name] };
                return true;
            }
        }
        return false;
    }

    handleDragInteraction(worldPos) {
        if (!this.activeControl) return;
        const hotspot = this.hotspots[this.activeControl];
        const localY = worldPos.y - this.y;
        const dy = this.dragStart.y - localY;
        const sensitivity = (hotspot.max - hotspot.min) / 128;
        let newValue = this.dragStart.value + dy * sensitivity;
        this.params[this.activeControl] = Math.max(hotspot.min, Math.min(hotspot.max, newValue));
        this.updateParams();
    }
    
    endInteraction() { this.activeControl = null; }

    getConnectorAt(x, y) {
        if (!this.inputs || !this.outputs) return null;
        const localX = x - this.x, localY = y - this.y;
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
            id: this.id,
            type: this.type,
            x: this.x,
            y: this.y,
            audioFilePath: this.audioFilePath,
            ...this.params,
        };
    }

    setState(state) {
        this.id = state.id || this.id;
        this.x = state.x;
        this.y = state.y;
        Object.assign(this.params, state);
        
        if (state.audioFilePath) {
            this.audioFilePath = state.audioFilePath;
            // Carga automáticamente el sample al restaurar el patch
            window.electronAPI.loadPatchAudioFile(this.audioFilePath, this.id);
        }
        
        this.updateParams();
    }

    disconnect() { this.workletNode?.disconnect(); }
}
