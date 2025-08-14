// src/modules/Speaker.js

export class Speaker {
    constructor(audioContext, x, y, id = 'speaker-main', initialState = {}) {
        this.audioContext = audioContext;
        this.id = id;
        this.x = x;
        this.y = y;
        this.width = 100;
        this.height = 120;
        this.type = 'Speaker';
        this.isPermanent = true;

        // --- ARQUITECTURA ESTÉREO ---
        this.merger = this.audioContext.createChannelMerger(2);
        this.merger.connect(this.audioContext.destination);

        this.inputL = this.audioContext.createGain();
        this.inputR = this.audioContext.createGain();

        this.inputL.connect(this.merger, 0, 0);
        this.inputR.connect(this.merger, 0, 1);

        this.inputs = {
            'In L': { x: 0, y: this.height / 2 - 20, type: 'audio', target: this.inputL },
            'In R': { x: 0, y: this.height / 2 + 20, type: 'audio', target: this.inputR }
        };
        this.outputs = {};
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
        ctx.fillText('OUTPUT', this.width / 2, 22);

        const cx = this.width / 2;
        const cy = this.height / 2 + 10;
        ctx.strokeStyle = '#E0E0E0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - 20, cy - 15);
        ctx.lineTo(cx - 5, cy - 15);
        ctx.lineTo(cx + 15, cy - 30);
        ctx.lineTo(cx + 15, cy + 30);
        ctx.lineTo(cx - 5, cy + 15);
        ctx.lineTo(cx - 20, cy + 15);
        ctx.closePath();
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
    }

    getConnectorAt(x, y) {
        const localX = x - this.x;
        const localY = y - this.y;
        for (const [name, props] of Object.entries(this.inputs)) {
            if (Math.hypot(localX - props.x, localY - props.y) < 9) {
                return { name, type: 'input', props, module: this };
            }
        }
        return null;
    }
    
    checkInteraction() { return false; }
    handleClick() { return false; }
    handleDragInteraction() {}
    endInteraction() {}
    
    destroy() {
        this.merger.disconnect();
        this.inputL.disconnect();
        this.inputR.disconnect();
    }
    
    getState() { return { id: this.id, type: this.type, x: this.x, y: this.y, isPermanent: this.isPermanent }; }
    setState(state) {
        this.x = state.x ?? this.x;
        this.y = state.y ?? this.y;
    }
}