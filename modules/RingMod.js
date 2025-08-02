// modules/RingMod.js
import { audioContext } from './AudioContext.js';

export class RingMod {
    constructor(x, y, id = null) {
        this.id = id || `ringmod-${Date.now()}`;
        this.type = 'RingMod';
        this.x = x;
        this.y = y;
        this.width = 150;
        this.height = 250;
        
        this.inputs = {};
        this.outputs = {};
        this.readyPromise = this.initWorklet();
    }

    async initWorklet() {
        try {
            // El worklet necesita 2 entradas (señal y modulador) y 1 salida.
            this.workletNode = new AudioWorkletNode(audioContext, 'ring-mod-processor', {
                numberOfInputs: 2,
                numberOfOutputs: 1,
                outputChannelCount: [1]
            });
            
            // --- INICIO DE LA CORRECCIÓN ---

            // 1. Crear un GainNode para cada entrada. Estos son los "enchufes" reales.
            this.inputNode = audioContext.createGain();
            this.modNode = audioContext.createGain();

            // 2. Conectar estos nodos de entrada al procesador del worklet.
            this.inputNode.connect(this.workletNode, 0, 0); // Conectar al primer canal de entrada (0) del worklet
            this.modNode.connect(this.workletNode, 0, 1);   // Conectar al segundo canal de entrada (1) del worklet

            // 3. Asignar los GainNodes como los 'targets' para las conexiones externas.
            this.inputs = {
                'In': { x: 40, y: this.height, type: 'audio', target: this.inputNode, orientation: 'vertical' },
                'Mod': { x: 110, y: this.height, type: 'audio', target: this.modNode, orientation: 'vertical' }
            };

            // --- FIN DE LA CORRECCIÓN ---

            this.outputs = {
                'Out': { x: this.width / 2, y: 0, type: 'audio', source: this.workletNode, orientation: 'vertical' }
            };

            // Conexión para mantener el procesador activo y evitar que se recolecte como basura.
            this.keepAliveNode = audioContext.createGain();
            this.keepAliveNode.gain.value = 0;
            this.workletNode.connect(this.keepAliveNode);
            this.keepAliveNode.connect(audioContext.destination);

        } catch (error) {
            console.error(`[RingMod-${this.id}] Error initializing worklet:`, error);
        }
    }

    disconnect() {
        // Desconectar todos los nodos para liberar recursos.
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
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('MOD. ANILLO', this.width / 2, this.height / 2);

        this.drawConnectors(ctx, hoveredConnectorInfo);
        ctx.restore();
    }
    
    drawConnectors(ctx, hovered) {
        const connectorRadius = 8;
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';

        Object.entries(this.inputs).forEach(([name, props]) => {
            const isHovered = hovered?.module === this && hovered.connector.name === name;
            ctx.beginPath();
            ctx.arc(props.x, props.y, connectorRadius, 0, Math.PI * 2);
            ctx.fillStyle = isHovered ? 'white' : '#4a90e2';
            ctx.fill();
            ctx.fillStyle = '#E0E0E0';
            ctx.fillText(name, props.x, props.y + connectorRadius + 12);
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
            ctx.fillText(name, props.x, props.y - connectorRadius - 4);
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