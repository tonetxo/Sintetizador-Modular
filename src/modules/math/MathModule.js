// src/modules/math/MathModule.js

export class MathModule {
    constructor(audioContext, x, y, id = null, initialState = {}) {
        this.audioContext = audioContext;
        this.id = id || `math-${Date.now()}`;
        this.x = x;
        this.y = y;
        this.width = 150;
        this.height = 200;
        this.type = 'Math';

        this.operations = ['+', '-', 'x', 'min', 'max'];
        this.params = {
            operation: initialState.operation || 0,
        };
        
        this.processor = null;
        this.outputNode = this.audioContext.createGain();

        this.setupPorts();
        this.readyPromise = this.initWorklet();
    }

    async initWorklet() {
        try {
            this.processor = new AudioWorkletNode(this.audioContext, 'math-processor', {
                numberOfInputs: 2,
                parameterData: { operation: this.params.operation }
            });
            this.processor.connect(this.outputNode);
            
            this.inputs['A'].target = this.processor;
            this.inputs['B'].target = this.processor;
        } catch (error) {
            console.error('Error creating Math processor:', error);
        }
    }

    setupPorts() {
        this.inputs = {
            'A': { x: 0, y: 50, type: 'cv', target: null, inputIndex: 0 },
            'B': { x: 0, y: 100, type: 'cv', target: null, inputIndex: 1 }
        };
        this.outputs = {
            'Out': { x: this.width, y: 75, type: 'cv', source: this.outputNode }
        };
    }
    
    handleClick(x, y) {
        const localPos = { x: x - this.x, y: y - this.y };
        if (localPos.x > this.width/2 - 25 && localPos.x < this.width/2 + 25 &&
            localPos.y > this.height / 2 - 25 && localPos.y < this.height/2 + 25) {
            this.params.operation = (this.params.operation + 1) % this.operations.length;
            if(this.processor) {
                this.processor.parameters.get('operation').setValueAtTime(this.params.operation, this.audioContext.currentTime);
            }
            return true;
        }
        return false;
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
        ctx.fillText('MATH', this.width / 2, 22);

        ctx.font = 'bold 36px Arial';
        ctx.fillText(this.operations[this.params.operation], this.width / 2, this.height / 2 + 15);

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
        Object.entries(this.outputs).forEach(([name, props]) => {
            const isHovered = hovered?.module === this && hovered.connector?.name === name;
            ctx.beginPath(); ctx.arc(props.x, props.y, r, 0, 2 * Math.PI);
            ctx.fillStyle = isHovered ? 'white' : '#222'; ctx.fill();
            ctx.strokeStyle = '#4a90e2'; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.fillStyle = '#E0E0E0'; ctx.textAlign = 'right';
            ctx.fillText(name, props.x - r - 4, props.y + 4);
        });
    }

    getConnectorAt(x, y) {
        const local = { x: x - this.x, y: y - this.y };
        for (const [name, props] of Object.entries(this.inputs)) {
            if (Math.hypot(local.x - props.x, local.y - props.y) < 9) return { name, type: 'input', props, module: this };
        }
        for (const [name, props] of Object.entries(this.outputs)) {
            if (Math.hypot(local.x - props.x, local.y - props.y) < 9) return { name, type: 'output', props, module: this };
        }
        return null;
    }

    checkInteraction() { return false; }
    endInteraction() {}
    handleDragInteraction() {}

    getState() { return { id: this.id, type: this.type, x: this.x, y: this.y, ...this.params }; }
    setState(state) {
        this.id = state.id || this.id;
        this.x = state.x ?? this.x;
        this.y = state.y ?? this.y;
        this.params.operation = state.operation || 0;
        if(this.processor) {
            this.processor.parameters.get('operation').value = this.params.operation;
        }
    }

    destroy() {
        this.processor?.disconnect();
        this.outputNode.disconnect();
    }
}