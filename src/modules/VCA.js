// src/modules/VCA.js

export class VCA {
    constructor(audioContext, x, y, id = null, initialState = {}) {
        this.audioContext = audioContext;
        this.id = id || `vca-${Date.now()}`;
        this.x = x;
        this.y = y;
        this.width = 150;
        this.height = 220;
        this.type = 'VCA';

        this.params = {
            gain: initialState.gain !== undefined ? initialState.gain : 0.8,
        };

        // --- REARQUITECTURA ESTÉREO ---
        this.inputL = this.audioContext.createGain();
        this.inputR = this.audioContext.createGain();
        this.outputL = this.audioContext.createGain();
        this.outputR = this.audioContext.createGain();

        this.inputL.connect(this.outputL);
        this.inputR.connect(this.outputR);
        
        this.outputL.gain.value = 0;
        this.outputR.gain.value = 0;

        this.cv1Gain = this.audioContext.createGain();
        this.cv1Gain.gain.value = this.params.gain;
        
        this.cv1Gain.connect(this.outputL.gain);
        this.cv1Gain.connect(this.outputR.gain);

        this.cv2 = this.audioContext.createGain();
        this.cv2.connect(this.outputL.gain);
        this.cv2.connect(this.outputR.gain);
        
        this.activeControl = null;
        this.paramHotspots = {};
        this.dragStart = {};

        this.inputs = {
            'In L': { x: 0, y: this.height / 2 - 60, type: 'audio', target: this.inputL },
            'In R': { x: 0, y: this.height / 2 - 20, type: 'audio', target: this.inputR },
            'CV1': { x: 0, y: this.height / 2 + 20, type: 'cv', target: this.cv1Gain },
            'CV2': { x: 0, y: this.height / 2 + 60, type: 'cv', target: this.cv2 },
        };
        this.outputs = {
            'Out L': { x: this.width, y: this.height / 2 - 20, type: 'audio', source: this.outputL },
            'Out R': { x: this.width, y: this.height / 2 + 20, type: 'audio', source: this.outputR },
        };
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
        ctx.fillText('STEREO VCA', this.width / 2, 22);

        this.drawVerticalSlider(ctx, 'gain', this.width / 2, 40, 160, 0, 1, this.params.gain, 'Level');
        
        this.drawConnectors(ctx, hoveredConnector);
        ctx.restore();
    }

    drawVerticalSlider(ctx, paramName, x, y, height, min, max, val, label) {
        const knobRadius = 8;
        ctx.font = '10px Arial';
        ctx.fillStyle = '#E0E0E0';
        ctx.textAlign = 'center';
        ctx.fillText(label.toUpperCase(), x, y - 5);
        ctx.fillText(val.toFixed(2), x, y + height + 15);
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + height);
        ctx.stroke();
        let normalizedValue = (val - min) / (max - min);
        const knobY = y + height - (normalizedValue * height);
        ctx.beginPath();
        ctx.arc(x, knobY, knobRadius, 0, Math.PI * 2);
        ctx.fillStyle = this.activeControl === paramName ? '#aaffff' : '#4a90e2';
        ctx.fill();
        this.paramHotspots[paramName] = { x: x - knobRadius, y, width: knobRadius * 2, height, min, max };
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
        const localY = worldPos.y - this.y;
        let normVal = (sliderRect.y + sliderRect.height - localY) / sliderRect.height;
        normVal = Math.max(0, Math.min(1, normVal));
        const newValue = sliderRect.min + normVal * (sliderRect.max - sliderRect.min);
        
        this.params.gain = newValue;
        this.cv1Gain.gain.setTargetAtTime(newValue, this.audioContext.currentTime, 0.01);
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
        this.params.gain = state.gain !== undefined ? state.gain : 0.8;
        this.cv1Gain.gain.setValueAtTime(this.params.gain, this.audioContext.currentTime);
    }

    destroy() {
        this.inputL.disconnect();
        this.inputR.disconnect();
        this.outputL.disconnect();
        this.outputR.disconnect();
        this.cv1Gain.disconnect();
        this.cv2.disconnect();
    }
}