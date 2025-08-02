// modules/RingMod.js
import { audioContext } from './AudioContext.js';

export class RingMod {
    constructor(x, y, id = null) {
        this.id = id || `ringmod-${Date.now()}`;
        this.type = 'RingMod';
        this.x = x;
        this.y = y;
        this.width = 150;
        this.height = 150; // Cuadrado
        
        this.inputs = {};
        this.outputs = {};
        this.readyPromise = this.initWorklet();
    }

    async initWorklet() {
        try {
            this.workletNode = new AudioWorkletNode(audioContext, 'ring-mod-processor', {
                numberOfInputs: 2,
                numberOfOutputs: 1,
                outputChannelCount: [1]
            });
            
            this.inputNode = audioContext.createGain();
            this.modNode = audioContext.createGain();

            this.inputNode.connect(this.workletNode, 0, 0);
            this.modNode.connect(this.workletNode, 0, 1);

            // Conectores a la izquierda
            this.inputs = {
                'In': { x: 0, y: this.height / 3, type: 'audio', target: this.inputNode, orientation: 'horizontal' },
                'Mod': { x: 0, y: (this.height / 3) * 2, type: 'audio', target: this.modNode, orientation: 'horizontal' }
            };

            // Conector a la derecha
            this.outputs = {
                'Out': { x: this.width, y: this.height / 2, type: 'audio', source: this.workletNode, orientation: 'horizontal' }
            };

            this.keepAliveNode = audioContext.createGain();
            this.keepAliveNode.gain.value = 0;
            this.workletNode.connect(this.keepAliveNode);
            this.keepAliveNode.connect(audioContext.destination);

        } catch (error) {
            console.error(`[RingMod-${this.id}] Error initializing worklet:`, error);
        }
    }

    disconnect() {
        this.inputNode?.disconnect();
        this.modNode?.disconnect();
        this.workletNode?.disconnect();
        this.keepAliveNode?.disconnect();
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
        ctx.font = '18px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('RM', this.width / 2, 25);

        // Dibuja el símbolo del modulador en anillo (cuadrado con X)
        ctx.save();
        // Centra el símbolo verticalmente en el módulo
        ctx.translate(this.width / 2, this.height / 2);
        
        const symbolSize = 60; // Símbolo más grande
        ctx.strokeStyle = '#E0E0E0';
        ctx.lineWidth = 2.5;

        // Dibuja el cuadrado
        ctx.strokeRect(-symbolSize / 2, -symbolSize / 2, symbolSize, symbolSize);

        // Dibuja la X
        ctx.beginPath();
        ctx.moveTo(-symbolSize / 2, -symbolSize / 2);
        ctx.lineTo(symbolSize / 2, symbolSize / 2);
        ctx.moveTo(symbolSize / 2, -symbolSize / 2);
        ctx.lineTo(-symbolSize / 2, symbolSize / 2);
        ctx.stroke();
        
        ctx.restore();

        this.drawConnectors(ctx, hoveredConnectorInfo);
        ctx.restore();
    }
    
    drawConnectors(ctx, hovered) {
        const connectorRadius = 8;
        ctx.font = '10px Arial';
        
        Object.entries(this.inputs).forEach(([name, props]) => {
            const isHovered = hovered?.module === this && hovered.connector.name === name;
            ctx.beginPath();
            ctx.arc(props.x, props.y, connectorRadius, 0, Math.PI * 2);
            ctx.fillStyle = isHovered ? 'white' : '#4a90e2';
            ctx.fill();
            ctx.fillStyle = '#E0E0E0';
            ctx.textAlign = 'left';
            ctx.fillText(name, props.x + connectorRadius + 4, props.y + 4);
        });

        Object.entries(this.outputs).forEach(([name, props]) => {
            const isHovered = hovered?.module === this && hovered.connector.name === name;
            ctx.beginPath();
            ctx.arc(props.x, props.y, connectorRadius, 0, Math.PI * 2);
            ctx.fillStyle = isHovered ? 'white' : '#222';
            ctx.fill();
            ctx.strokeStyle = '#4a90e2';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.fillStyle = '#E0E0E0';
            ctx.textAlign = 'right';
            ctx.fillText(name, props.x - connectorRadius - 4, props.y + 4);
        });
    }

    getConnectorAt(x, y) {
        const localX = x - this.x;
        const localY = y - this.y;
        for (const [name, props] of Object.entries(this.inputs)) {
            if (Math.hypot(localX - props.x, localY - props.y) < 9)
                return { name, type: 'input', props, module: this };
        }
        for (const [name, props] of Object.entries(this.outputs)) {
            if (Math.hypot(localX - props.x, localY - props.y) < 9)
                return { name, type: 'output', props, module: this };
        }
        return null;
    }

    getState() {
        return { id: this.id, type: this.type, x: this.x, y: this.y };
    }

    setState(state) {
        this.id = state.id || this.id;
        this.x = state.x;
        this.y = state.y;
    }
}
