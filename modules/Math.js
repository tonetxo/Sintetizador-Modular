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
        this.height = 220; // Aumentar altura

        this.operations = ['A + B', 'A - B', 'A × B', 'MIN', 'MAX'];
        this.currentOperationIndex = initialState.operation || 0;
        this.levelA = initialState.levelA || 1;
        this.levelB = initialState.levelB || 1;
        
        this.node = null;
        this.isReady = false;
        this.activeControl = null;
        this.paramHotspots = {};

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
                outputChannelCount: [1],
                parameterData: {
                    levelA: this.levelA,
                    levelB: this.levelB
                }
            });
            this.operationParam = this.node.parameters.get('operation');
            this.levelAParam = this.node.parameters.get('levelA');
            this.levelBParam = this.node.parameters.get('levelB');
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
            ctx.font = 'bold 16px Arial';
            ctx.fillText(this.operations[this.currentOperationIndex], this.width / 2, this.height / 2 - 10);
            this.drawKnobs(ctx);
        } else {
            ctx.font = '12px Arial';
            ctx.fillStyle = '#ff80ab';
            ctx.fillText('Cargando...', this.width / 2, this.height / 2 + 10);
        }

        ctx.restore();
        this.drawConnectors(ctx, hoveredConnectorInfo);
    }

    drawKnobs(ctx) {
        const knobRadius = 15;
        const yPos = this.height - 45;
        this.drawKnob(ctx, 'levelA', 'Nivel A', this.width / 4, yPos, knobRadius, this.levelA);
        this.drawKnob(ctx, 'levelB', 'Nivel B', this.width * 3 / 4, yPos, knobRadius, this.levelB);
    }

    drawKnob(ctx, paramName, label, x, y, radius, value) {
        const angleRange = Math.PI * 1.5;
        const startAngle = Math.PI * 0.75;
        const normalizedValue = (value + 2) / 4; // Normalizar de -2,2 a 0,1
        const angle = startAngle + normalizedValue * angleRange;

        ctx.font = '10px Arial';
        ctx.fillStyle = '#E0E0E0';
        ctx.textAlign = 'center';
        ctx.fillText(label, x, y - radius - 5);
        ctx.fillText(value.toFixed(2), x, y + radius + 12);

        ctx.strokeStyle = '#555';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, radius, startAngle, startAngle + angleRange);
        ctx.stroke();

        ctx.strokeStyle = this.activeControl === paramName ? '#aaffff' : '#4a90e2';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
        ctx.stroke();

        this.paramHotspots[paramName] = { x: x - radius, y: y - radius, width: radius * 2, height: radius * 2 };
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
        if (localX > 20 && localX < this.width - 20 && localY > 40 && localY < this.height - 80) {
            const newIndex = (this.currentOperationIndex + 1) % this.operations.length;
            this.setOperation(newIndex);
            return true;
        }
        return false;
    }

    checkInteraction(pos) {
        const localPos = { x: pos.x - this.x, y: pos.y - this.y };
        for (const [param, rect] of Object.entries(this.paramHotspots)) {
            if (localPos.x >= rect.x && localPos.x <= rect.x + rect.width &&
                localPos.y >= rect.y && localPos.y <= rect.y + rect.height) {
                this.activeControl = param;
                this.dragStart = { y: pos.y, value: this[param] };
                return true;
            }
        }
        return false;
    }

    handleDragInteraction(worldPos) {
        if (!this.activeControl) return;

        const dy = this.dragStart.y - worldPos.y;
        const sensitivity = 0.02;
        let newValue = this.dragStart.value + dy * sensitivity;
        newValue = Math.max(-2, Math.min(2, newValue)); // Clamp between -2 and 2

        if (this.activeControl === 'levelA') {
            this.levelA = newValue;
            this.levelAParam.setTargetAtTime(newValue, audioContext.currentTime, 0.01);
        } else if (this.activeControl === 'levelB') {
            this.levelB = newValue;
            this.levelBParam.setTargetAtTime(newValue, audioContext.currentTime, 0.01);
        }
    }

    endInteraction() {
        this.activeControl = null;
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
            operation: this.currentOperationIndex,
            levelA: this.levelA,
            levelB: this.levelB
        }; 
    }

    setState(state) {
        this.id = state.id || this.id;
        this.x = state.x;
        this.y = state.y;
        this.setOperation(state.operation || 0);
        this.levelA = state.levelA || 1;
        this.levelB = state.levelB || 1;
        if (this.isReady) {
            this.levelAParam.setValueAtTime(this.levelA, audioContext.currentTime);
            this.levelBParam.setValueAtTime(this.levelB, audioContext.currentTime);
        }
    }
}
