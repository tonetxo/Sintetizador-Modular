// src/modules/audio/modulators/SampleAndHold.js

export class SampleAndHold {
    constructor(audioContext, x, y, id = null, initialState = {}) {
        this.audioContext = audioContext;
        this.id = id || `sah-${Date.now()}`;
        this.x = x;
        this.y = y;
        this.width = 150;
        this.height = 150;
        this.type = 'SampleAndHold';

        this.node = null;
        this.isReady = false;

        this.inputs = {
            'In': { x: 0, y: this.height / 3, type: 'cv', target: null, inputIndex: 0 },
            'Trig': { x: 0, y: (this.height / 3) * 2, type: 'gate', target: null, inputIndex: 1 }
        };
        this.outputs = {
            'Out': { x: this.width, y: this.height / 2, type: 'cv', source: null }
        };

        this.readyPromise = this.initWorklet();
    }

    async initWorklet() {
        try {
            this.node = new AudioWorkletNode(this.audioContext, 'sample-and-hold-processor', {
                numberOfInputs: 2,
            });
            
            this.inputs['In'].target = this.node;
            this.inputs['Trig'].target = this.node;
            this.outputs['Out'].source = this.node;

            this.isReady = true;
        } catch(err) {
            console.error(`[SampleAndHold-${this.id}] Error initializing worklet:`, err);
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
        ctx.font = '18px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('S&H', this.width / 2, 25);
        
        ctx.strokeStyle = '#E0E0E0';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        const step = 20, w = 3 * step, h = 2 * step, sx = this.width/2 - w/2, sy = this.height/2 + h/2;
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + step, sy);
        ctx.lineTo(sx + step, sy - step);
        ctx.lineTo(sx + 2 * step, sy - step);
        ctx.lineTo(sx + 2 * step, sy - 2 * step);
        ctx.lineTo(sx + 3 * step, sy - 2 * step);
        ctx.stroke();

        this.drawConnectors(ctx, hoveredConnector);
        ctx.restore();
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
    
    checkInteraction() { return false; }
    handleClick() { return false; }
    endInteraction() {}
    handleDragInteraction() {}
    
    getState() { return { id: this.id, type: this.type, x: this.x, y: this.y }; }
    setState(state) {
        this.id = state.id || this.id;
        this.x = state.x ?? this.x;
        this.y = state.y ?? this.y;
    }
    destroy() { this.node?.disconnect(); }
}