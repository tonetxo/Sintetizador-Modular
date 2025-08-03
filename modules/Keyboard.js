// modules/Keyboard.js
import { audioContext } from './AudioContext.js';

const KEY_TO_MIDI = {
    'a': 60, 'w': 61, 's': 62, 'e': 63, 'd': 64, 'f': 65,
    't': 66, 'g': 67, 'y': 68, 'h': 69, 'u': 70, 'j': 71, 'k': 72
};

export class Keyboard {
    constructor(x, y, id = 'keyboard-main') {
        this.id = id;
        this.x = x;
        this.y = y;
        this.width = 250;
        this.height = 100;
        this.isPermanent = true;
        this.type = 'Keyboard';
        this.octave = 4; // Octava inicial

        this.pitchCV = audioContext.createConstantSource();
        this.pitchCV.offset.value = 0; // Valor inicial de 0V
        this.pitchCV.start();
        
        this.gateSignalNode = audioContext.createConstantSource();
        this.gateSignalNode.offset.value = 0;
        this.gateSignalNode.start();

        this.outputs = {
            'DISPARO': { x: this.width / 2 - 60, y: this.height, type: 'gate', source: this.gateSignalNode, orientation: 'vertical' },
            'TENSION': { x: this.width / 2 + 60, y: this.height, type: 'cv', source: this.pitchCV, orientation: 'vertical' }
        };
        
        this.activeKeys = new Set();
        this.lastNote = 60;

        // --- Portamento ---
        this.portamentoValue = 0.2;
        this.portamentoSlider = { x: 60, y: 65, width: 130, height: 10 };
        this.isDraggingPortamento = false;
        this.recalculatePortamentoTime();

        // --- Octave Buttons ---
        this.octaveDownButton = { x: 10, y: 35, width: 20, height: 20 };
        this.octaveUpButton = { x: this.width - 30, y: 35, width: 20, height: 20 };
    }

    recalculatePortamentoTime() {
        this.portamentoTime = Math.pow(this.portamentoValue, 3) * 2.0;
    }

    handleKeyDown(key) {
        if (KEY_TO_MIDI[key] && !this.activeKeys.has(key)) {
            const now = audioContext.currentTime;

            // Si ya hay notas sonando (legato), re-disparamos el gate
            if (this.activeKeys.size > 0) {
                this.gateSignalNode.offset.setValueAtTime(0, now);
                this.gateSignalNode.offset.setValueAtTime(1, now + 0.001); // Pulso muy corto
            } else {
                this.gateSignalNode.offset.setValueAtTime(1, now);
            }

            this.activeKeys.add(key);
            const baseMidi = KEY_TO_MIDI[key];
            this.lastNote = baseMidi + (this.octave - 4) * 12;
            
            const cvValue = (this.lastNote - 60) / 12;
            
            this.pitchCV.offset.cancelScheduledValues(now);
            this.pitchCV.offset.setValueAtTime(this.pitchCV.offset.value, now);
            this.pitchCV.offset.linearRampToValueAtTime(cvValue, now + this.portamentoTime);
        }
    }

    handleKeyUp(key) {
        if (this.activeKeys.has(key)) {
            this.activeKeys.delete(key);
            if (this.activeKeys.size === 0) {
                this.gateSignalNode.offset.setValueAtTime(0, audioContext.currentTime);
            }
        }
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
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('TECLADO', this.width / 2, 20);

        // Dibujar Slider de Portamento
        ctx.font = '10px Arial';
        ctx.fillText('PORTAMENTO', this.width / 2, this.portamentoSlider.y - 5);
        
        const slider = this.portamentoSlider;
        ctx.fillStyle = '#111';
        ctx.fillRect(slider.x, slider.y, slider.width, slider.height);
        ctx.strokeStyle = '#555';
        ctx.strokeRect(slider.x, slider.y, slider.width, slider.height);

        const handleX = slider.x + this.portamentoValue * slider.width;
        ctx.fillStyle = this.isDraggingPortamento ? '#aaffff' : '#E0E0E0';
        ctx.fillRect(handleX - 2, slider.y - 2, 4, slider.height + 4);

        // Dibujar botones de octava y valor
        ctx.fillStyle = '#E0E0E0';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('-', this.octaveDownButton.x + 10, this.octaveDownButton.y + 15);
        ctx.fillText('+', this.octaveUpButton.x + 10, this.octaveUpButton.y + 15);
        ctx.strokeRect(this.octaveDownButton.x, this.octaveDownButton.y, this.octaveDownButton.width, this.octaveDownButton.height);
        ctx.strokeRect(this.octaveUpButton.x, this.octaveUpButton.y, this.octaveUpButton.width, this.octaveUpButton.height);

        ctx.font = '14px Arial';
        ctx.fillText(`Oct: ${this.octave}`, this.width / 2, 45);
        
        ctx.restore();
        this.drawConnectors(ctx, hoveredConnectorInfo);
    }
    
    drawConnectors(ctx, hovered) {
        const isHovered = (type, name) => hovered && hovered.module === this && hovered.connector.type === type && hovered.connector.name === name;
        const connectorRadius = 8;
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';

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
            ctx.fillText(name, x, y + connectorRadius + 12);
        });
    }

    getConnectorAt(x, y) {
        for (const [name, props] of Object.entries(this.outputs)) {
            const dist = Math.sqrt(Math.pow(x - (this.x + props.x), 2) + Math.pow(y - (this.y + props.y), 2));
            if (dist < 9) return { name, type: 'output', props, module: this };
        }
        return null;
    }

    handleMouseDown(x, y) {
        const slider = this.portamentoSlider;
        const localX = x - this.x;
        const localY = y - this.y;

        if (localX >= slider.x && localX <= slider.x + slider.width &&
            localY >= slider.y - 5 && localY <= slider.y + slider.height + 5) {
            this.isDraggingPortamento = true;
            this.updatePortamentoFromPosition(localX);
            return true;
        }

        // Lógica para botones de octava
        if (localX >= this.octaveDownButton.x && localX <= this.octaveDownButton.x + this.octaveDownButton.width &&
            localY >= this.octaveDownButton.y && localY <= this.octaveDownButton.y + this.octaveDownButton.height) {
            this.octave = Math.max(0, this.octave - 1);
            return true;
        }

        if (localX >= this.octaveUpButton.x && localX <= this.octaveUpButton.x + this.octaveUpButton.width &&
            localY >= this.octaveUpButton.y && localY <= this.octaveUpButton.y + this.octaveUpButton.height) {
            this.octave = Math.min(8, this.octave + 1);
            return true;
        }

        return false;
    }

    // eslint-disable-next-line no-unused-vars
    handleMouseDrag(x, y) {
        if (this.isDraggingPortamento) {
            const localX = x - this.x;
            this.updatePortamentoFromPosition(localX);
            return true;
        }
        return false;
    }

    handleMouseUp() {
        if (this.isDraggingPortamento) {
            this.isDraggingPortamento = false;
            return true;
        }
        return false;
    }

    updatePortamentoFromPosition(localX) {
        const slider = this.portamentoSlider;
        let value = (localX - slider.x) / slider.width;
        this.portamentoValue = Math.max(0, Math.min(1, value)); // Clamp 0-1
        this.recalculatePortamentoTime();
    }

    getState() {
        return {
            id: this.id,
            type: this.type,
            x: this.x,
            y: this.y,
            isPermanent: this.isPermanent,
            portamentoValue: this.portamentoValue,
            octave: this.octave
        };
    }

    setState(state) {
        this.x = state.x;
        this.y = state.y;
        this.portamentoValue = state.portamentoValue !== undefined ? state.portamentoValue : 0.2;
        this.octave = state.octave !== undefined ? state.octave : 4;
        this.recalculatePortamentoTime();
    }
}