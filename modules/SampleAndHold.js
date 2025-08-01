// modules/SampleAndHold.js
import { audioContext } from './AudioContext.js';

const workletPromise = audioContext.audioWorklet.addModule('worklets/sample-and-hold-processor.js')
    .catch(e => console.error('Error loading S&H AudioWorklet:', e));

export class SampleAndHold {
    constructor(x, y, id = null, initialState = {}) {
        this.id = id || `sah-${Date.now()}`;
        this.x = x;
        this.y = y;
        this.width = 120;
        this.height = 120;
        this.type = 'SampleAndHold';

        this.node = null;
        this.isReady = false;

        this.inputs = {
            'IN': { x: 0, y: 40, type: 'cv', target: null, inputIndex: 0, orientation: 'horizontal' },
            'TRIG': { x: 0, y: 80, type: 'gate', target: null, inputIndex: 1, orientation: 'horizontal' }
        };
        this.outputs = {
            'OUT': { x: this.width, y: this.height / 2, type: 'cv', source: null, orientation: 'horizontal' }
        };

        this.readyPromise = workletPromise.then(() => {
            this.node = new AudioWorkletNode(audioContext, 'sample-and-hold-processor', {
                numberOfInputs: 2,
            });
            
            this.inputs['IN'].target = this.node;
            this.inputs['TRIG'].target = this.node;
            this.outputs['OUT'].source = this.node;
            
            this.isReady = true;
        }).catch(err => {
            console.error("S&H Module failed to become ready:", err);
        });
    }

    draw(ctx, isSelected, hoveredConnectorInfo) {
        ctx.save();
        ctx.translate(this.x, this.y);

        ctx.globalAlpha = this.isReady ? 1.0 : 0.5;

        ctx.fillStyle = '#222';
        ctx.strokeStyle = isSelected ? '#aaffff' : '#E0E0E0';
        ctx.lineWidth = 2;
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.strokeRect(0, 0, this.width, this.height);

        ctx.fillStyle = '#E0E0E0';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('S & H', this.width / 2, 22);
        
        if (this.isReady) {
            ctx.strokeStyle = '#E0E0E0';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            const sx = 30, sy = 80, step = 15;
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx + step, sy);
            ctx.lineTo(sx + step, sy - step);
            ctx.lineTo(sx + 2 * step, sy - step);
            ctx.lineTo(sx + 2 * step, sy - 2 * step);
            ctx.lineTo(sx + 3 * step, sy - 2 * step);
            ctx.stroke();
        } else {
            ctx.font = '12px Arial';
            ctx.fillStyle = '#ff80ab';
            ctx.fillText('Cargando...', this.width / 2, this.height / 2 + 10);
        }

        ctx.restore();
        this.drawConnectors(ctx, hoveredConnectorInfo);
    }

    drawConnectors(ctx, hovered) {
        if (!this.isReady) return;

        ctx.globalAlpha = 1.0;
        const isHovered = (type, name) => hovered && hovered.module === this && hovered.connector.type === type && hovered.connector.name === name;
        const connectorRadius = 8;
        ctx.font = '10px Arial';
        ctx.fillStyle = '#E0E0E0';
        ctx.textAlign = 'left';

        Object.entries(this.inputs).forEach(([name, props]) => {
            const x = this.x + props.x;
            const y = this.y + props.y;
            ctx.beginPath();
            ctx.arc(x, y, connectorRadius, 0, Math.PI * 2);
            ctx.fillStyle = isHovered('input', name) ? 'white' : '#4a90e2';
            ctx.fill();
            ctx.fillStyle = '#E0E0E0';
            ctx.fillText(name, x + connectorRadius + 4, y + 4);
        });

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
            ctx.textAlign = 'right';
            ctx.fillText(name, x - connectorRadius - 4, y + 4);
        });
    }

    getConnectorAt(x, y) {
        if (!this.isReady) return null;

        for (const [name, props] of Object.entries(this.inputs)) {
            if (Math.sqrt(Math.pow(x - (this.x + props.x), 2) + Math.pow(y - (this.y + props.y), 2)) < 9)
                return { name, type: 'input', props, module: this };
        }
        for (const [name, props] of Object.entries(this.outputs)) {
            if (Math.sqrt(Math.pow(x - (this.x + props.x), 2) + Math.pow(y - (this.y + props.y), 2)) < 9)
                return { name, type: 'output', props, module: this };
        }
        return null;
    }
    
    disconnect() {
        if (this.node) this.node.disconnect();
    }

    getState() { return { id: this.id, type: 'SampleAndHold', x: this.x, y: this.y }; }

    setState(state) {
        this.id = state.id || this.id;
        this.x = state.x;
        this.y = state.y;
    }
}