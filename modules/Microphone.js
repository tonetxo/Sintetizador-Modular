import { audioContext } from './AudioContext.js';

export class Microphone {
    constructor(x, y, id = null, initialState = {}) {
        this.id = id || `microphone-${Date.now()}`;
        this.x = x;
        this.y = y;
        this.width = 150;
        this.height = 100;
        this.type = 'Microphone';
        this.stream = null;
        this.source = null;
        this.output = audioContext.createGain();

        this.outputs = {
            'audio': { x: this.width, y: this.height / 2, type: 'audio', source: this.output, orientation: 'horizontal' }
        };
        this.inputs = {};

        this.init();
    }

    async init() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.source = audioContext.createMediaStreamSource(this.stream);
            this.source.connect(this.output);
            console.log('Microphone access granted.');
        } catch (err) {
            console.error('Error accessing microphone:', err);
            alert('Could not access microphone. Please ensure you have given permission.');
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
        ctx.fillText('Microphone', this.width / 2, 22);

        // Dibuja el icono del micrófono
        const micX = this.width / 2;
        const micY = this.height / 2 + 5;
        ctx.fillStyle = '#E0E0E0';
        ctx.beginPath();
        ctx.rect(micX - 10, micY - 20, 20, 30); // Cuerpo del micro
        ctx.fill();
        ctx.beginPath();
        ctx.arc(micX, micY - 20, 10, Math.PI, 2 * Math.PI); // Cabeza del micro
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(micX, micY + 10);
        ctx.lineTo(micX, micY + 25);
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#E0E0E0';
        ctx.stroke();


        this.drawConnectors(ctx, hoveredConnectorInfo);
        ctx.restore();
    }

    drawConnectors(ctx, hovered) {
        const connectorRadius = 8;
        ctx.font = '10px Arial';

        const outputName = 'audio';
        const outputProps = this.outputs[outputName];
        const ox = outputProps.x;
        const oy = outputProps.y;
        ctx.beginPath();
        ctx.arc(ox, oy, connectorRadius, 0, Math.PI * 2);
        ctx.fillStyle = (hovered && hovered.module === this && hovered.connector.name === outputName) ? 'white' : '#222';
        ctx.fill();
        ctx.strokeStyle = '#f0a048';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = '#E0E0E0';
        ctx.textAlign = 'right';
        ctx.fillText('OUT', ox - connectorRadius - 4, oy + 4);
    }

    getConnectorAt(x, y) {
        const localX = x - this.x;
        const localY = y - this.y;
        for (const [name, props] of Object.entries(this.outputs)) {
            if (Math.sqrt(Math.pow(localX - props.x, 2) + Math.pow(localY - props.y, 2)) < 9)
                return { name, type: 'output', props, module: this };
        }
        return null;
    }

    disconnect() {
        if (this.source) {
            this.source.disconnect();
        }
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }
        this.output.disconnect();
    }

    getState() {
        return {
            id: this.id, type: 'Microphone', x: this.x, y: this.y
        };
    }

    setState(state) {
        this.id = state.id || this.id;
        this.x = state.x;
        this.y = state.y;
    }
}