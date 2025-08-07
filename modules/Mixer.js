// modules/Mixer.js
import { audioContext } from './AudioContext.js';

export class Mixer {
    constructor(x, y, id = null, initialState = {}) {
        this.id = id || `mixer-${Date.now()}`;
        this.type = 'Mixer';
        this.x = x;
        this.y = y;
        this.width = 240; // Más ancho
        this.height = 180; // Más alto
        this.NUM_CHANNELS = 4;

        this.channelGains = [];
        this.inputs = {};
        this.outputs = {};
        this.activeControl = null;
        this.paramHotspots = {};

        this.outputGain = audioContext.createGain();
        this.outputGain.gain.value = 1;

        for (let i = 0; i < this.NUM_CHANNELS; i++) {
            const gainNode = audioContext.createGain();
            const initialGain = initialState[`gain${i}`] !== undefined ? initialState[`gain${i}`] : (i === 0 ? 0.75 : 0);
            gainNode.gain.setValueAtTime(initialGain, audioContext.currentTime);
            gainNode.connect(this.outputGain);
            this.channelGains.push(gainNode);

            // Entradas a la izquierda, con más espaciado vertical
            this.inputs[`IN ${i + 1}`] = {
                x: 0,
                y: 55 + i * 30,
                type: 'audio',
                target: gainNode,
                orientation: 'horizontal'
            };
        }

        this.outputs['SALIDA'] = {
            x: this.width,
            y: this.height / 2,
            type: 'audio',
            source: this.outputGain,
            orientation: 'horizontal'
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
        ctx.fillText('MIXER', this.width / 2, 22);

        const sliderWidth = this.width * 0.65;
        const sliderX = (this.width - sliderWidth) / 2 + 15; // Desplazar a la derecha
        for (let i = 0; i < this.NUM_CHANNELS; i++) {
            const sliderY = 55 + i * 30;
            this.drawHorizontalSlider(
                ctx,
                `gain${i}`,
                sliderX,
                sliderY,
                sliderWidth,
                0, 1,
                this.channelGains[i].gain.value,
                `CH ${i + 1}`
            );
        }
        
        // CORRECCIÓN: Dibujar conectores ANTES de ctx.restore()
        this.drawConnectors(ctx, hoveredConnectorInfo);
        ctx.restore();
    }

    drawHorizontalSlider(ctx, paramName, x, y, width, minVal, maxVal, currentValue, label) {
        const knobHeight = 16;
        const knobWidth = 10;

        ctx.font = '10px Arial';
        ctx.fillStyle = '#E0E0E0';
        ctx.textAlign = 'left';
        ctx.fillText(label, x, y - 10);

        ctx.strokeStyle = '#555';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + width, y);
        ctx.stroke();

        const normalizedValue = (currentValue - minVal) / (maxVal - minVal);
        const knobX = x + normalizedValue * width - (knobWidth / 2);

        ctx.fillStyle = this.activeControl === paramName ? '#aaffff' : '#4a90e2';
        ctx.fillRect(knobX, y - knobHeight / 2, knobWidth, knobHeight);
        ctx.strokeStyle = '#E0E0E0';
        ctx.lineWidth = 1;
        ctx.strokeRect(knobX, y - knobHeight / 2, knobWidth, knobHeight);

        this.paramHotspots[paramName] = { x: x, y: y - knobHeight, width: width, height: knobHeight * 2, min: minVal, max: maxVal };
    }

    drawConnectors(ctx, hovered) {
        const isHovered = (type, name) => hovered && hovered.module === this && hovered.connector.type === type && hovered.connector.name === name;
        const connectorRadius = 8;
        ctx.font = '10px Arial';

        Object.entries(this.inputs).forEach(([name, props]) => {
            const x = props.x;
            const y = props.y;
            ctx.beginPath();
            ctx.arc(x, y, connectorRadius, 0, Math.PI * 2);
            ctx.fillStyle = isHovered('input', name) ? 'white' : '#4a90e2';
            ctx.fill();
            ctx.fillStyle = '#E0E0E0';
            ctx.textAlign = 'left';
            ctx.fillText(name.replace('IN ', ''), x + connectorRadius + 5, y + 4);
        });

        Object.entries(this.outputs).forEach(([name, props]) => {
            const x = props.x;
            const y = props.y;
            ctx.beginPath();
            ctx.arc(x, y, connectorRadius, 0, Math.PI * 2);
            ctx.fillStyle = isHovered('output', name) ? 'white' : '#222';
            ctx.fill();
            ctx.strokeStyle = '#4a90e2';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.fillStyle = '#E0E0E0';
            ctx.textAlign = 'right';
            ctx.fillText(name, x - connectorRadius - 4, y + 4);
        });
    }

    checkInteraction(pos) {
        const localPos = { x: pos.x - this.x, y: pos.y - this.y };
        for (const [param, rect] of Object.entries(this.paramHotspots)) {
            if (localPos.x >= rect.x && localPos.x <= rect.x + rect.width &&
                localPos.y >= rect.y && localPos.y <= rect.y + rect.height) {
                this.activeControl = param;
                return true;
            }
        }
        return false;
    }

    handleDragInteraction(worldPos) {
        if (!this.activeControl) return;
        const sliderRect = this.paramHotspots[this.activeControl];
        const localX = worldPos.x - this.x;
        let normalizedValue = (localX - sliderRect.x) / sliderRect.width;
        normalizedValue = Math.max(0, Math.min(1, normalizedValue));

        const channelIndex = parseInt(this.activeControl.replace('gain', ''), 10);
        const gainParam = this.channelGains[channelIndex].gain;
        const newValue = sliderRect.min + normalizedValue * (sliderRect.max - sliderRect.min);
        gainParam.setTargetAtTime(newValue, audioContext.currentTime, 0.01);
    }

    endInteraction() {
        this.activeControl = null;
    }

    getConnectorAt(x, y) {
        const localX = x - this.x, localY = y - this.y;
        for (const [name, props] of Object.entries(this.inputs)) {
            if (Math.hypot(localX - props.x, localY - props.y) < 9)
                return { name, type: 'input', props, module: this };
        }
        for (const [name, props] of Object.entries(this.outputs)) {
            if (Math.hypot(localX - props.x, localY - props.y) < 9)
                return { name, type: 'output', props, module: this };
        }
        return null;
    }

    disconnect() {
        this.outputGain.disconnect();
        this.channelGains.forEach(ch => ch.disconnect());
    }

    getState() {
        const state = {
            id: this.id,
            type: 'Mixer',
            x: this.x, y: this.y,
        };
        for (let i = 0; i < this.NUM_CHANNELS; i++) {
            state[`gain${i}`] = this.channelGains[i].gain.value;
        }
        return state;
    }

    setState(state) {
        this.id = state.id || this.id;
        this.x = state.x; this.y = state.y;
        for (let i = 0; i < this.NUM_CHANNELS; i++) {
            if (state[`gain${i}`] !== undefined) {
                this.channelGains[i].gain.setValueAtTime(state[`gain${i}`], audioContext.currentTime);
            }
        }
    }
}
