// modules/Math.js
import { audioContext } from './AudioContext.js';

const workletPromise = audioContext.audioWorklet.addModule('worklets/math-processor.js')
    .catch(e => console.error('Error loading Math AudioWorklet:', e));

export class MathModule {
    constructor(x, y, id = null, initialState = {}) {
        this.id = id || `math-${Date.now()}`;
        this.type = 'Math';
        this.x = x;
        this.y = y;
        this.width = 120;
        this.height = 150;

        this.operations = ['A + B', 'A - B', 'A × B', 'MIN', 'MAX'];
        this.currentOperationIndex = initialState.operation || 0;
        
        this.node = null;
        this.isReady = false;

        this.inputs = {
            'A': { x: 0, y: 40, type: 'cv', target: null, inputIndex: 0, orientation: 'horizontal' },
            'B': { x: 0, y: 110, type: 'cv', target: null, inputIndex: 1, orientation: 'horizontal' }
        };
        this.outputs = {
            'Out': { x: this.width, y: this.height / 2, type: 'cv', source: null, orientation: 'horizontal' }
        };

        this.readyPromise = workletPromise.then(() => {
            this.node = new AudioWorkletNode(audioContext, 'math-processor', { 
                numberOfInputs: 2,
                numberOfOutputs: 1,
                outputChannelCount: [1]
            });
            this.operationParam = this.node.parameters.get('operation');
            this.setOperation(this.currentOperationIndex);
            
            this.inputs['A'].target = this.node;
            this.inputs['B'].target = this.node;
            this.outputs['Out'].source = this.node;

            // Conexión para mantener el procesador activo
            this.keepAliveNode = audioContext.createGain();
            this.keepAliveNode.gain.value = 0;
            this.node.connect(this.keepAliveNode);
            this.keepAliveNode.connect(audioContext.destination);
            
            this.isReady = true;
        }).catch(err => {
            console.error("Math Module failed to become ready:", err);
        });
    }

    setOperation(index) {
        this.currentOperationIndex = index;
        if (this.operationParam) {
            this.operationParam.setValueAtTime(index, audioContext.currentTime);
        }
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
        ctx.fillText('MATES', this.width / 2, 22);

        if (this.isReady) {
            ctx.font = 'bold 20px Arial';
            ctx.fillText(this.operations[this.currentOperationIndex], this.width / 2, this.height / 2 + 8);
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
        const isHovered = (type, name) => hovered && hovered.module === this && hovered.connector.name === name;
        const connectorRadius = 8;
        ctx.font = '10px Arial';

        Object.entries(this.inputs).forEach(([name, props]) => {
            const x = this.x + props.x;
            const y = this.y + props.y;
            ctx.beginPath();
            ctx.arc(x, y, connectorRadius, 0, Math.PI * 2);
            ctx.fillStyle = isHovered('input', name) ? 'white' : '#4a90e2';
            ctx.fill();
            ctx.fillStyle = '#E0E0E0';
            ctx.textAlign = 'left';
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

    handleClick(x, y) {
        const localX = x - this.x;
        const localY = y - this.y;
        // Área de clic en el centro del módulo
        if (localX > 20 && localX < this.width - 20 && localY > 40 && localY < this.height - 40) {
            const newIndex = (this.currentOperationIndex + 1) % this.operations.length;
            this.setOperation(newIndex);
            return true;
        }
        return false;
    }

    getConnectorAt(x, y) {
        if (!this.isReady) return null;
        for (const [name, props] of Object.entries(this.inputs)) {
            if (Math.hypot(x - (this.x + props.x), y - (this.y + props.y)) < 9)
                return { name, type: 'input', props, module: this };
        }
        for (const [name, props] of Object.entries(this.outputs)) {
            if (Math.hypot(x - (this.x + props.x), y - (this.y + props.y)) < 9)
                return { name, type: 'output', props, module: this };
        }
        return null;
    }
    
    disconnect() {
        if (this.node) {
            this.node.disconnect();
        }
        if (this.keepAliveNode) {
            this.keepAliveNode.disconnect();
        }
    }

    getState() { 
        return { 
            id: this.id, 
            type: this.type, 
            x: this.x, 
            y: this.y,
            operation: this.currentOperationIndex
        }; 
    }

    setState(state) {
        this.id = state.id || this.id;
        this.x = state.x;
        this.y = state.y;
        this.setOperation(state.operation || 0);
    }
}
