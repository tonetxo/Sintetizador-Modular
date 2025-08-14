// src/modules/analysis/Oscilloscope.js

export class Oscilloscope {
    constructor(audioContext, x, y, id = null) {
        this.audioContext = audioContext;
        this.id = id || `scope-${Date.now()}`;
        this.x = x;
        this.y = y;
        this.width = 300;
        this.height = 200;
        this.type = 'Oscilloscope';

        this.canvas = document.createElement('canvas');
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.ctx = this.canvas.getContext('2d');

        this.analyser = this.audioContext.createAnalyser();
        this.inputNode = this.audioContext.createGain();
        this.inputNode.connect(this.analyser);

        this.analyser.fftSize = 2048;
        this.bufferLength = this.analyser.frequencyBinCount;
        this.dataArray = new Float32Array(this.bufferLength);

        this.parameters = {
            timeScale: 1, triggerLevel: 0,
            triggerMode: 'auto', triggerSlope: 'rising',
            persistence: 0.5, lineWidth: 2,
            lineColor: '#00ff00'
        };

        this.setupPorts();
        this.startRendering();
    }

    setupPorts() {
        this.inputs = {
            'In': { x: 0, y: this.height / 2, type: 'audio', target: this.inputNode }
        };
        this.outputs = {};
    }

    startRendering() {
        this.isRendering = true;
        this.render();
    }

    render = () => {
        if (!this.isRendering) return;
        requestAnimationFrame(this.render);

        this.analyser.getFloatTimeDomainData(this.dataArray);

        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        this.ctx.fillRect(0, 0, this.width, this.height);

        let triggerIndex = this.findTriggerPoint();

        this.ctx.beginPath();
        this.ctx.strokeStyle = this.parameters.lineColor;
        this.ctx.lineWidth = this.parameters.lineWidth;

        const timeScale = this.width / (this.bufferLength * this.parameters.timeScale);
        const voltScale = (this.height / 2);

        for (let i = 0; i < this.bufferLength; i++) {
            const x = i * timeScale;
            const dataIndex = (i + triggerIndex) % this.bufferLength;
            const y = (this.height / 2) + (this.dataArray[dataIndex] * voltScale);

            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }
        this.ctx.stroke();
    }

    draw(ctx, isSelected, hoveredConnector) {
        ctx.save();
        ctx.translate(this.x, this.y);

        ctx.fillStyle = '#222';
        ctx.strokeStyle = isSelected ? '#aaffff' : '#E0E0E0';
        ctx.lineWidth = 2;
        ctx.fillRect(0, 0, this.width, this.height);

        ctx.drawImage(this.canvas, 0, 0);

        ctx.strokeRect(0, 0, this.width, this.height);
        
        ctx.fillStyle = '#E0E0E0';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.type, this.width / 2, 22);
        
        this.drawConnectors(ctx, hoveredConnector);
        ctx.restore();
    }

    drawConnectors(ctx, hovered) {
        const r = 8;
        ctx.font = '10px Arial';
        Object.entries(this.inputs).forEach(([name, props]) => {
            const isHovered = hovered?.module === this && hovered.connector?.name === name;
            ctx.beginPath(); ctx.arc(props.x, props.y, r, 0, 2 * Math.PI);
            ctx.fillStyle = isHovered ? 'white' : '#4a90e2'; ctx.fill();
            ctx.fillStyle = '#E0E0E0'; ctx.textAlign = 'left';
            ctx.fillText(name, props.x + r + 4, props.y + 4);
        });
    }

    getConnectorAt(x, y) {
        const local = { x: x - this.x, y: y - this.y };
        for (const [name, props] of Object.entries(this.inputs)) {
            if (Math.hypot(local.x - props.x, local.y - props.y) < 9) return { name, type: 'input', props, module: this };
        }
        return null;
    }
    
    findTriggerPoint() {
        if (this.parameters.triggerMode === 'auto') {
            return 0;
        }
        const threshold = this.parameters.triggerLevel;
        const rising = this.parameters.triggerSlope === 'rising';
        for (let i = 1; i < this.bufferLength; i++) {
            const prev = this.dataArray[i - 1];
            const curr = this.dataArray[i];
            if (rising && prev <= threshold && curr > threshold) { return i; } 
            else if (!rising && prev >= threshold && curr < threshold) { return i; }
        }
        return 0;
    }
    
    checkInteraction() { return false; }
    handleClick() { return false; }
    endInteraction() {}
    handleDragInteraction() {}

    setParameter(name, value) {
        if (name in this.parameters) {
            this.parameters[name] = value;
        }
    }
    
    getState() { return { id: this.id, type: this.type, x: this.x, y: this.y }; }
    setState(state) {
        this.id = state.id || this.id;
        this.x = state.x ?? this.x;
        this.y = state.y ?? this.y;
    }

    destroy() {
        this.isRendering = false;
        this.inputNode.disconnect();
    }
}