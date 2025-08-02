import { audioContext } from './AudioContext.js';

export class Vocoder {
    constructor(x, y, id = null, initialState = {}) {
        this.id = id || `vocoder-${Date.now()}`;
        this.x = x;
        this.y = y;
        this.width = 180;
        this.height = 120;
        this.type = 'Vocoder';

        this.readyPromise = this.initWorklet();
    }

    async initWorklet() {
        try {
            this.node = new AudioWorkletNode(audioContext, 'vocoder-processor', {
                numberOfInputs: 2,
                numberOfOutputs: 1,
                outputChannelCount: [1]
            });

            this.inputs = {
                'Carrier': { x: 40, y: this.height, type: 'audio', target: this.node, inputIndex: 0, orientation: 'vertical' },
                'Modulator': { x: 140, y: this.height, type: 'audio', target: this.node, inputIndex: 1, orientation: 'vertical' }
            };
            this.outputs = {
                'Output': { x: this.width, y: this.height / 2, type: 'audio', source: this.node, orientation: 'horizontal' }
            };
        } catch (error) {
            console.error(`[Vocoder-${this.id}] Error initializing worklet:`, error);
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
        ctx.fillText('Vocoder', this.width / 2, 22);

        this.drawConnectors(ctx, hoveredConnectorInfo);
        ctx.restore();
    }

    drawConnectors(ctx, hovered) {
        const connectorRadius = 8;
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#E0E0E0';

        // Inputs
        for (const [name, props] of Object.entries(this.inputs)) {
            const x = props.x;
            const y = props.y;
            ctx.beginPath();
            ctx.arc(x, y, connectorRadius, 0, Math.PI * 2);
            ctx.fillStyle = (hovered && hovered.module === this && hovered.connector.name === name) ? 'white' : '#4a90e2';
            ctx.fill();
            ctx.fillStyle = '#E0E0E0';
            ctx.fillText(name, x, y + connectorRadius + 12);
        }

        // Output
        const outputName = 'Output';
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
        const connectorRadius = 9;

        for (const [name, props] of Object.entries(this.inputs)) {
            if (Math.sqrt(Math.pow(localX - props.x, 2) + Math.pow(localY - props.y, 2)) < connectorRadius)
                return { name, type: 'input', props, module: this };
        }
        for (const [name, props] of Object.entries(this.outputs)) {
            if (Math.sqrt(Math.pow(localX - props.x, 2) + Math.pow(localY - props.y, 2)) < connectorRadius)
                return { name, type: 'output', props, module: this };
        }
        return null;
    }

    disconnect() {
        if (this.node) {
            this.node.disconnect();
        }
    }

    getState() {
        return {
            id: this.id, type: 'Vocoder', x: this.x, y: this.y
        };
    }

    setState(state) {
        this.id = state.id || this.id;
        this.x = state.x;
        this.y = state.y;
    }
}
