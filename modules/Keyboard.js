// modules/Keyboard.js
import { audioContext } from './AudioContext.js';

const KEY_TO_MIDI = {
    'a': 60, 'w': 61, 's': 62, 'e': 63, 'd': 64, 'f': 65,
    't': 66, 'g': 67, 'y': 68, 'h': 69, 'u': 70, 'j': 71, 'k': 72
};

function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
}

export class Keyboard {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 250;
        this.height = 80;
        this.isPermanent = true;
        this.type = 'Keyboard';

        this.pitchCV = audioContext.createGain();
        this.pitchCV.gain.value = 0;
        
        const pitchSource = audioContext.createConstantSource();
        pitchSource.offset.value = 1;
        pitchSource.start();
        pitchSource.connect(this.pitchCV);
        
        this.gateOutput = { connectedModules: [] };
        this.inputs = {}; 
        this.outputs = {
            'DISPARO': { x: this.width / 2 - 60, y: this.height, type: 'gate', orientation: 'vertical' },
            'TENSION': { x: this.width / 2 + 60, y: this.height, type: 'cv', source: this.pitchCV, orientation: 'vertical' }
        };
        
        this.activeKeys = new Set();
        this.lastNote = 60;
    }

    handleKeyDown(key) {
        if (KEY_TO_MIDI[key] && !this.activeKeys.has(key)) {
            this.activeKeys.add(key);
            this.lastNote = KEY_TO_MIDI[key];
            const freq = midiToFreq(this.lastNote);
            this.pitchCV.gain.setTargetAtTime(freq, audioContext.currentTime, 0.01);
            if (this.activeKeys.size === 1) {
                this.gateOutput.connectedModules.forEach(module => {
                    if (module.trigger) module.trigger();
                });
            }
        }
    }

    handleKeyUp(key) {
        if (this.activeKeys.has(key)) {
            this.activeKeys.delete(key);
            if (this.activeKeys.size === 0) {
                this.gateOutput.connectedModules.forEach(module => {
                     if (module.gateOff) module.gateOff();
                });
            }
        }
    }
    
    connectGate(module) {
        if (!this.gateOutput.connectedModules.includes(module)) {
            this.gateOutput.connectedModules.push(module);
        }
    }
    
    disconnectGate(module) {
        const index = this.gateOutput.connectedModules.indexOf(module);
        if (index > -1) {
            this.gateOutput.connectedModules.splice(index, 1);
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
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('TECLADO', this.width / 2, 35);

        if (this.activeKeys.size > 0) {
            ctx.fillText(`Nota: ${this.lastNote}`, this.width / 2, 55);
        }
        
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
}