// src/modules/Keyboard.js

const KEY_TO_MIDI = {
    'a': 60, 'w': 61, 's': 62, 'e': 63, 'd': 64, 'f': 65,
    't': 66, 'g': 67, 'y': 68, 'h': 69, 'u': 70, 'j': 71, 'k': 72
};

export class Keyboard {
    constructor(audioContext, x, y, id = 'keyboard-main', initialState = {}) {
        this.audioContext = audioContext;
        this.id = id;
        this.x = x;
        this.y = y;
        this.width = 250;
        this.height = 100;
        this.isPermanent = initialState.isPermanent || false;
        this.type = 'Keyboard';
        
        this.params = {
            octave: initialState.octave || 4,
            portamento: initialState.portamento || 0.05
        };

        this.pitchCV = this.audioContext.createConstantSource();
        this.pitchCV.offset.value = 0;
        this.pitchCV.start();
        
        this.gateSignalNode = this.audioContext.createConstantSource();
        this.gateSignalNode.offset.value = 0;
        this.gateSignalNode.start();

        this.outputs = {
            'Gate': { x: this.width / 2 - 60, y: 0, type: 'gate', source: this.gateSignalNode },
            'CV': { x: this.width / 2 + 60, y: 0, type: 'cv', source: this.pitchCV }
        };
        this.inputs = {};
        
        this.activeKeys = new Set();
        this.lastNote = 60;
        this.activeControl = null;
        this.paramHotspots = {};
        this.dragStart = {};
    }

    handleKeyDown(key) {
        if (KEY_TO_MIDI[key] && !this.activeKeys.has(key)) {
            const now = this.audioContext.currentTime;
            
            // --- CORRECCIÓN LEGATO ---
            // Si ya hay una nota sonando, fuerza un reinicio del gate para
            // que el ADSR se dispare de nuevo (re-trigger).
            if (this.activeKeys.size > 0) {
                this.gateSignalNode.offset.setValueAtTime(0, now);
            }
            this.gateSignalNode.offset.setTargetAtTime(1, now, 0.001);

            this.activeKeys.add(key);
            const baseMidi = KEY_TO_MIDI[key];
            this.lastNote = baseMidi + (this.params.octave - 4) * 12;
            const cvValue = (this.lastNote - 60) / 12;
            const timeConstant = this.params.portamento / 5;
            this.pitchCV.offset.setTargetAtTime(cvValue, now, timeConstant);
        }
    }

    handleKeyUp(key) {
        if (this.activeKeys.has(key)) {
            this.activeKeys.delete(key);
            if (this.activeKeys.size === 0) {
                this.gateSignalNode.offset.setTargetAtTime(0, this.audioContext.currentTime, 0.002);
            }
        }
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
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('KEYBOARD', this.width / 2, 20);

        this.drawHorizontalSlider(ctx, 'portamento', 60, 65, 130, 0, 2, this.params.portamento, 'Glide (s)');
        
        ctx.fillStyle = '#E0E0E0';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.strokeRect(10, 35, 20, 20);
        ctx.fillText('-', 20, 51);
        ctx.strokeRect(this.width - 30, 35, 20, 20);
        ctx.fillText('+', this.width - 20, 51);
        ctx.font = '14px Arial';
        ctx.fillText(`Oct: ${this.params.octave}`, this.width / 2, 45);
        
        this.drawConnectors(ctx, hoveredConnector);
        ctx.restore();
    }
    
    drawHorizontalSlider(ctx, paramName, x, y, width, minVal, maxVal, currentValue, label) {
        const knobRadius = 8;
        ctx.font = '10px Arial';
        ctx.fillStyle = '#E0E0E0';
        ctx.textAlign = 'center';
        ctx.fillText(label.toUpperCase(), x + width/2, y - 5);
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
        this.paramHotspots[paramName] = { x, y: y - knobRadius, width, height: knobRadius * 2, min: minVal, max: maxVal };
    }

    drawConnectors(ctx, hovered) {
        const connectorRadius = 8;
        ctx.font = '10px Arial';
        Object.entries(this.outputs).forEach(([name, props]) => {
            const ox = props.x, oy = props.y;
            const isHovered = hovered?.module === this && hovered.connector?.name === name;
            ctx.beginPath(); ctx.arc(ox, oy, connectorRadius, 0, Math.PI * 2);
            ctx.fillStyle = isHovered ? 'white' : '#222'; ctx.fill();
            ctx.strokeStyle = '#4a90e2'; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.fillStyle = '#E0E0E0'; ctx.textAlign = 'center';
            ctx.fillText(name.toUpperCase(), ox, oy - connectorRadius - 4);
        });
    }

    checkInteraction(pos) {
        const localPos = { x: pos.x - this.x, y: pos.y - this.y };
        for (const [param, rect] of Object.entries(this.paramHotspots)) {
            if (localPos.x >= rect.x && localPos.x <= rect.x + rect.width &&
                localPos.y >= rect.y && localPos.y <= rect.y + rect.height) {
                this.activeControl = param;
                this.dragStart = { x: pos.x, value: this.params[param] };
                return true;
            }
        }
        return false;
    }
    
    handleDragInteraction(worldPos) {
        if (this.activeControl !== 'portamento') return;
        const sliderRect = this.paramHotspots.portamento;
        const localX = worldPos.x - this.x;
        let normVal = (localX - sliderRect.x) / sliderRect.width;
        normVal = Math.max(0, Math.min(1, normVal));
        this.params.portamento = sliderRect.min + normVal * (sliderRect.max - sliderRect.min);
    }

    endInteraction() { this.activeControl = null; }
    
    handleClick(x, y) {
        const localX = x - this.x;
        const localY = y - this.y;
        if (localY >= 35 && localY <= 55) {
            if (localX >= 10 && localX <= 30) {
                this.params.octave = Math.max(0, this.params.octave - 1);
                return true;
            }
            if (localX >= this.width - 30 && localX <= this.width - 10) {
                this.params.octave = Math.min(8, this.params.octave + 1);
                return true;
            }
        }
        return false;
    }

    getConnectorAt(x, y) {
        const localX = x - this.x;
        const localY = y - this.y;
        for (const [name, props] of Object.entries(this.outputs)) {
            if (Math.hypot(localX - props.x, localY - props.y) < 9) {
                return { name, type: 'output', props, module: this };
            }
        }
        return null;
    }
    
    getState() { return { id: this.id, type: this.type, x: this.x, y: this.y, isPermanent: this.isPermanent, ...this.params }; }
    
    setState(state) {
        this.id = state.id || this.id;
        this.x = state.x ?? this.x;
        this.y = state.y ?? this.y;
        this.params.octave = state.octave || 4;
        this.params.portamento = state.portamento || 0.05;
    }
    
    destroy() { this.pitchCV.disconnect(); this.gateSignalNode.disconnect(); }
}