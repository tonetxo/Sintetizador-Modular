// modules/Osciloscopio.js
import { audioContext } from './AudioContext.js'; // Asegúrate de que AudioContext.js exporta audioContext

export class Osciloscopio {
    constructor(x, y, id = null, initialState = {}) {
        this.id = id || `osc-${Date.now()}`; // Genera un ID único si no se proporciona
        this.type = 'Osciloscopio';
        this.x = x;
        this.y = y;
        this.width = 200; // Ancho del módulo osciloscopio
        this.height = 130; // Alto del módulo osciloscopio

        this.analyserNode = audioContext.createAnalyser();
        this.analyserNode.fftSize = 2048;
        this.bufferLength = this.analyserNode.frequencyBinCount;
        this.dataArray = new Uint8Array(this.bufferLength);

        // Definición de conectores
        this.inputs = {
            'input': { x: this.width / 2, y: this.height, type: 'audio', target: this.analyserNode, orientation: 'vertical' }
        };
        this.outputs = {}; // Un osciloscopio no tiene salidas de audio

        // Aplicar estado inicial si existe (para carga de patch)
        this.setState(initialState);
    }

    // Método para dibujar el módulo en el canvas principal
    draw(ctx, isSelected, hoveredConnectorInfo) {
        ctx.save();
        ctx.translate(this.x, this.y);

        // Dibujar el marco del módulo
        ctx.fillStyle = '#1a1a1a'; // Color de fondo del módulo
        ctx.strokeStyle = isSelected ? '#aaffff' : '#888';
        ctx.lineWidth = 2;
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.strokeRect(0, 0, this.width, this.height);

        // Título
        ctx.fillStyle = '#E0E0E0';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('OSCILOSCOPIO', this.width / 2, 20);

        // Dibujar el área de la forma de onda
        const displayPadding = 10;
        const displayX = displayPadding;
        const displayY = 30; // Debajo del título
        const displayWidth = this.width - (displayPadding * 2);
        const displayHeight = this.height - displayY - (displayPadding + 10); // Espacio para conectores

        ctx.fillStyle = '#000'; // Fondo del display del osciloscopio
        ctx.fillRect(displayX, displayY, displayWidth, displayHeight);
        ctx.strokeStyle = '#555';
        ctx.strokeRect(displayX, displayY, displayWidth, displayHeight);

        // Dibujar rejilla (opcional)
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 0.5;
        const stepX = displayWidth / 10;
        const stepY = displayHeight / 5;
        for (let i = 0; i <= 10; i++) {
            ctx.beginPath();
            ctx.moveTo(displayX + i * stepX, displayY);
            ctx.lineTo(displayX + i * stepX, displayY + displayHeight);
            ctx.stroke();
        }
        for (let i = 0; i <= 5; i++) {
            ctx.beginPath();
            ctx.moveTo(displayX, displayY + i * stepY);
            ctx.lineTo(displayX + displayWidth, displayY + i * stepY);
            ctx.stroke();
        }

                // Obtener datos de tiempo y dibujar la forma de onda
        this.analyserNode.getByteTimeDomainData(this.dataArray);

        // Comprobar si la señal es efectivamente silenciosa midiendo la amplitud pico a pico
        let minVal = 255;
        let maxVal = 0;
        for (let i = 0; i < this.bufferLength; i++) {
            const val = this.dataArray[i];
            if (val < minVal) minVal = val;
            if (val > maxVal) maxVal = val;
        }
        
        // Si la diferencia entre el valor más alto y el más bajo es muy pequeña, es silencio.
        const isSilent = (maxVal - minVal) < 5; // Aumentamos un poco el umbral por si hay ruido DC

        ctx.lineWidth = 2;
        ctx.strokeStyle = '#0F0'; // Color de la forma de onda (verde brillante)
        ctx.beginPath();

        const sliceWidth = displayWidth * 1.0 / this.bufferLength;
        let xPos = 0;

        if (isSilent) {
            // Si no hay señal, dibujar una línea plana en el centro
            const yPos = displayY + (displayHeight / 2);
            ctx.moveTo(displayX, yPos);
            ctx.lineTo(displayX + displayWidth, yPos);
        } else {
            for (let i = 0; i < this.bufferLength; i++) {
                const v = this.dataArray[i] / 128.0; // Normalizar a 0-2 (0-255 en dataArray)
                const yPos = displayY + (v * displayHeight / 2); // Mapear a la altura del display

                if (i === 0) {
                    ctx.moveTo(displayX + xPos, yPos);
                } else {
                    ctx.lineTo(displayX + xPos, yPos);
                }

                xPos += sliceWidth;
            }
        }

        ctx.stroke();

        // Dibujar conectores (se asume que tu sistema de módulos ya lo hace o puedes añadirlo aquí)
        for (const [name, props] of Object.entries(this.inputs)) {
            const connectorX = props.x;
            const connectorY = props.y;
            const connectorRadius = 8;
            const isHovered = hoveredConnectorInfo && hoveredConnectorInfo.module === this && hoveredConnectorInfo.connector.name === name;

            ctx.beginPath();
            ctx.arc(connectorX, connectorY, connectorRadius, 0, Math.PI * 2);
            ctx.fillStyle = isHovered ? 'white' : '#4a90e2'; // Color de conector de entrada
            ctx.fill();
            ctx.strokeStyle = '#333';
            ctx.stroke();
        }

        ctx.restore();
    }

    // Método para obtener el conector bajo el mouse (necesario para tu onMouseMove/onMouseDown)
    getConnectorAt(worldX, worldY) {
        const connectorRadius = 9; // Un poco más grande para detección de clic
        // Convertir coordenadas del mundo a coordenadas relativas al módulo
        const localX = worldX - this.x;
        const localY = worldY - this.y;

        for (const [name, props] of Object.entries(this.inputs)) {
            const dist = Math.sqrt(Math.pow(localX - props.x, 2) + Math.pow(localY - props.y, 2));
            if (dist < connectorRadius) return { name, type: 'input', props, module: this };
        }
        return null;
    }

    // Método para guardar el estado del módulo (posicionamiento, tipo, etc.)
    getState() {
        return {
            id: this.id,
            type: this.type,
            x: this.x,
            y: this.y,
            // Los analizadores no tienen parámetros de audio que guardar directamente
        };
    }

    // Método para cargar el estado del módulo (solo posicionamiento por ahora)
    setState(state) {
        if (state.x !== undefined) this.x = state.x;
        if (state.y !== undefined) this.y = state.y;
        if (state.id) this.id = state.id; // Mantener el ID si se carga
    }

    // Método para desconectar el AnalyserNode cuando el módulo es eliminado
    disconnect() {
        if (this.analyserNode) {
            this.analyserNode.disconnect();
            // Asegúrate de que no haya otras conexiones pendientes al AnalyserNode
            // Este nodo en particular no necesita desconectarse de `audioContext.destination`
            // porque no produce sonido, solo lo analiza.
        }
    }
}
