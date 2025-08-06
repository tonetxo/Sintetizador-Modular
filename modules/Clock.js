import { audioContext } from './AudioContext.js';

export class Clock {
    constructor(x, y, id = null, initialState = {}) {
        this.id = id || `clock-${Date.now()}`;
        this.type = 'Clock';
        this.x = x;
        this.y = y;
        this.width = 150;
        this.height = 100;

        this.params = {
            tempo: initialState.tempo || 120,
            running: initialState.running !== undefined ? initialState.running : false,
        };

        this.outputs = {
            'CLOCK_OUT': { x: this.width, y: this.height / 2, type: 'gate', source: null, orientation: 'horizontal' }, // Source will be workletNode
        };
        this.inputs = {};

        this.hotspots = {};
        this.dragStart = {};
        this.activeControl = null;

        this.readyPromise = this.initWorklet();
    }

    async initWorklet() {
        try {
            this.workletNode = new AudioWorkletNode(audioContext, 'clock-processor', {
                outputChannelCount: [1] // Un canal de salida
            });
            this.outputs['CLOCK_OUT'].source = this.workletNode; // Asignar el workletNode como fuente

            // Workaround para mantener el workletNode activo en el grafo de audio
            const dummyGain = audioContext.createGain();
            dummyGain.gain.value = 0;
            this.workletNode.connect(dummyGain);
            dummyGain.connect(audioContext.destination);

            this.updateWorkletState();
        } catch (error) {
            console.error(`[Clock-${this.id}] Error initializing clock worklet:`, error);
        }
    }

    updateWorkletState() {
        if (!this.workletNode) return;
        this.workletNode.port.postMessage({ type: 'config', params: this.params });
    }

    handleClick(x, y) {
        const localPos = { x: x - this.x, y: y - this.y };
        for (const [name, spot] of Object.entries(this.hotspots)) {
            if (this.isInside(localPos, spot)) {
                if (spot.type === 'button' && name === 'run/stop') {
                    if (audioContext.state === 'suspended') audioContext.resume();
                    this.params.running = !this.params.running;
                    this.updateWorkletState();
                    return true;
                }
            }
        }
        return false;
    }

    checkInteraction(pos) {
        const localPos = { x: pos.x - this.x, y: pos.y - this.y };
        for (const [name, spot] of Object.entries(this.hotspots)) {
            if (this.isInside(localPos, spot) && spot.type === 'knob') {
                this.activeControl = name;
                this.dragStart = { y: localPos.y, value: this.params[name] };
                return true;
            }
        }
        return false;
    }

    endInteraction() {
        this.updateWorkletState();
        this.activeControl = null;
        this.dragStart = {};
    }

    handleDragInteraction(worldPos) {
        if (!this.activeControl) return;
        const hotspot = this.hotspots[this.activeControl];
        if (hotspot?.type === 'knob') {
            const localY = worldPos.y - this.y;
            const dy = this.dragStart.y - localY;
            const range = hotspot.max - hotspot.min;
            let newValue = this.dragStart.value + dy * (range / 128);
            newValue = Math.max(hotspot.min, Math.min(hotspot.max, newValue));
            this.params[this.activeControl] = newValue;
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
        ctx.fillText('CLOCK', this.width / 2, 22);

        this.drawKnob(ctx, 'tempo', 'BPM', this.width / 2, 55, 30, 300, this.params.tempo);
        this.drawButton(ctx, 'run/stop', this.params.running ? 'STOP' : 'START', this.width / 2 - 30, 80, 60, 20);

        this.drawConnectors(ctx, hoveredConnectorInfo);
        ctx.restore();
    }

    drawKnob(ctx, paramName, label, x, y, min, max, value) {
        const knobRadius = 18;
        const angleRange = Math.PI * 1.5;
        const startAngle = Math.PI * 0.75;
        const normalizedValue = (value - min) / (max - min);
        const angle = startAngle + normalizedValue * angleRange;

        ctx.font = '10px Arial';
        ctx.fillStyle = '#E0E0E0';
        ctx.textAlign = 'center';
        ctx.fillText(label, x, y - knobRadius - 5);
        ctx.fillText(value.toFixed(0), x, y + knobRadius + 12);

        ctx.strokeStyle = '#555';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, knobRadius, startAngle, startAngle + angleRange);
        ctx.stroke();

        ctx.strokeStyle = '#4a90e2';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(angle) * knobRadius, y + Math.sin(angle) * knobRadius);
        ctx.stroke();

        this.hotspots[paramName] = { x: x - knobRadius, y: y - knobRadius, width: knobRadius * 2, height: knobRadius * 2, min, max, type: 'knob' };
    }

    drawButton(ctx, paramName, text, x, y, w, h) {
        ctx.fillStyle = this.params.running ? '#4a90e2' : '#333';
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1;
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = '#E0E0E0'; 
        ctx.font = 'bold 12px Arial'; 
        ctx.textAlign = 'center'; 
        ctx.textBaseline = 'middle'; 
        ctx.fillText(text, x + w / 2, y + h / 2); 
        this.hotspots[paramName] = { x, y, width: w, height: h, type: 'button' }; 
    }

    drawConnectors(ctx, hovered) {
        const connectorRadius = 8;
        ctx.font = '10px Arial';
        Object.entries(this.outputs).forEach(([name, props]) => {
            const isHovered = hovered?.module === this && hovered?.connector.name === name;
            const ox = props.x, oy = props.y;
            ctx.beginPath();
            ctx.arc(ox, oy, connectorRadius, 0, Math.PI * 2);
            ctx.fillStyle = isHovered ? 'white' : '#222';
            ctx.fill();
            ctx.strokeStyle = '#4a90e2';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.fillStyle = '#E0E0E0';
            ctx.textAlign = 'right';
            ctx.fillText(name, ox - connectorRadius - 4, oy + 4);
        });
    }

    isInside(pos, rect) { return pos.x >= rect.x && pos.x <= rect.x + rect.width && pos.y >= rect.y && pos.y <= rect.y + rect.height; }

    getConnectorAt(x, y) {
        const localX = x - this.x, localY = y - this.y;
        for (const [name, props] of Object.entries(this.outputs)) {
            if (Math.hypot(localX - props.x, localY - props.y) < 9) return { name, type: 'output', props, module: this };
        }
        return null;
    }

    getState() {
        return { id: this.id, type: this.type, x: this.x, y: this.y, ...this.params };
    }

    setState(state) {
        this.id = state.id || this.id;
        this.x = state.x;
        this.y = state.y;
        Object.assign(this.params, state);
        this.updateWorkletState();
    }

    disconnect() {
        this.workletNode?.port.close();
    }
}
