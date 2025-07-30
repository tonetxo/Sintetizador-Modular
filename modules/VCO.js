// modules/VCO.js
import { audioContext } from './AudioContext.js';

export class VCO {
    constructor(x, y, id = null, initialState = {}) { // Añadido id y initialState para carga/guardado
        this.id = id || `vco-${Date.now()}`; // Genera un ID único si no se proporciona
        this.x = x;
        this.y = y;
        this.width = 160;
        this.height = 180; // Aumentar altura para acomodar el detune (antes 140)
        this.type = 'VCO';

        this.oscillator = audioContext.createOscillator();
        this.oscillator.frequency.setValueAtTime(0, audioContext.currentTime);
        this.oscillator.detune.setValueAtTime(0, audioContext.currentTime); // Inicializar detune a 0
        this.oscillator.start();

        const bufferSize = audioContext.sampleRate * 2;
        const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
        const output = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }
        this.noise = audioContext.createBufferSource();
        this.noise.buffer = buffer;
        this.noise.loop = true;
        this.noise.start();
        
        this.output = audioContext.createGain();
        this.activeSource = this.oscillator;
        this.activeSource.connect(this.output);

        this.inputs = {
            '1V/Oct': { x: 30, y: this.height, type: 'cv', target: this.oscillator.frequency, orientation: 'vertical' },
            'FM': { x: 80, y: this.height, type: 'cv', target: this.oscillator.frequency, orientation: 'vertical' },
            'DETUNE_CV': { x: 130, y: this.height, type: 'cv', target: this.oscillator.detune, orientation: 'vertical' }
        };
        this.outputs = {
            'audio': { x: this.width, y: this.height / 2, type: 'audio', source: this.output, orientation: 'horizontal' }
        };
        
        this.waveforms = ['sawtooth', 'square', 'sine', 'triangle', 'noise'];
        this.currentWaveformIndex = 0;
        this.detuneValue = 0; // Valor actual del detune (para el slider y el estado)

        // Aplicar estado inicial si existe (para carga de patch)
        if (Object.keys(initialState).length > 0) {
            this.setState(initialState);
        } else {
            this.setWaveform(this.waveforms[this.currentWaveformIndex]);
        }
    }

    setWaveform(type) {
        // Desconectar el activo antes de cambiar
        if (this.activeSource) {
            this.activeSource.disconnect(this.output);
            // Asegurarse de que el AudioParam detune y frequency no estén conectados al antiguo activeSource
            // si cambiamos de oscillator a noise.
            // Para OscillatorNode, frequency y detune son AudioParams, no necesitan desconectarse directamente
            // a menos que cambies el destino de esos AudioParams.
            // Aquí, los AudioParams (frequency, detune) siempre controlan this.oscillator,
            // por lo que no hay problema con desconectar this.activeSource del output.
        }

        const waveformName = this.waveforms[this.currentWaveformIndex];

        if (waveformName === 'noise') {
            this.activeSource = this.noise;
            // Para el ruido, la frecuencia y detune del oscilador no aplican,
            // pero el noise.buffer es constante, así que no necesitamos hacer nada especial aquí.
        } else {
            this.activeSource = this.oscillator;
            this.oscillator.type = waveformName;
        }
        this.activeSource.connect(this.output);
    }

    // Método para establecer el valor del detune directamente (desde UI)
    setDetune(value) {
        if (!isFinite(value)) return; // Guarda contra valores no finitos
        // Redondea a un decimal para mantenerlo limpio
        let detuneVal = Math.round(value * 10) / 10;
        // Evitar -0 que puede causar problemas
        if (Object.is(detuneVal, -0)) {
            detuneVal = 0;
        }
        this.detuneValue = detuneVal;
        this.oscillator.detune.setValueAtTime(this.detuneValue, audioContext.currentTime);
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
        ctx.fillText('VCO', this.width / 2, 22);

        // Dibujo del selector de forma de onda
        ctx.beginPath();
        ctx.arc(this.width / 2, 75, 25, 0, Math.PI * 2);
        ctx.stroke();
        this.drawWaveform(ctx, this.width / 2, 75, 18);

        // --- Dibujar control de Detune Fino ---
        const detuneControlY = 115; // Subido para dejar espacio a los conectores
        const sliderWidth = this.width - 20; // Ancho del slider
        const sliderX = 10; // Posición X del slider
        const knobRadius = 8; // Radio del "pomo" del slider

        // Etiqueta Detune
        ctx.fillStyle = '#E0E0E0';
        ctx.font = '10px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('DETUNE', sliderX, detuneControlY - 18);

        // Dibujar barra del slider
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 4; // Un poco más gruesa para mejor estética
        ctx.beginPath();
        ctx.moveTo(sliderX, detuneControlY + knobRadius / 2);
        ctx.lineTo(sliderX + sliderWidth, detuneControlY + knobRadius / 2);
        ctx.stroke();

        // Dibujar el pomo del slider
        const normalizedDetune = (this.detuneValue + 50) / 100; // Mapear de -50 a 50 a 0-1
        const knobX = sliderX + (sliderWidth * normalizedDetune);
        ctx.beginPath();
        ctx.arc(knobX, detuneControlY + knobRadius / 2, knobRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#4a90e2'; // Color del pomo
        ctx.fill();
        ctx.strokeStyle = '#E0E0E0';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Mostrar valor de Detune
        ctx.textAlign = 'right';
        ctx.fillText(`${this.detuneValue.toFixed(1)}c`, sliderX + sliderWidth, detuneControlY - 18);
        // --- Fin del control de Detune Fino ---

        this.drawConnectors(ctx, hoveredConnectorInfo);
        ctx.restore();
    }
    
    drawWaveform(ctx, cx, cy, radius) {
        ctx.save();
        ctx.strokeStyle = '#E0E0E0';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const type = this.waveforms[this.currentWaveformIndex];
        if (type === 'noise') {
            ctx.font = 'bold 30px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('*', cx, cy);
        } else if (type === 'sawtooth') {
            ctx.moveTo(cx - radius, cy + radius/2);
            ctx.lineTo(cx, cy - radius);
            ctx.lineTo(cx, cy + radius);
            ctx.lineTo(cx + radius, cy - radius/2);
        } else if (type === 'square') {
            ctx.moveTo(cx - radius, cy + radius/2);
            ctx.lineTo(cx - radius, cy - radius/2);
            ctx.lineTo(cx, cy - radius/2);
            ctx.lineTo(cx, cy + radius/2);
            ctx.lineTo(cx + radius, cy + radius/2);
        } else if (type === 'sine') {
             ctx.moveTo(cx - radius, cy);
             ctx.quadraticCurveTo(cx - radius/2, cy - radius, cx, cy);
             ctx.quadraticCurveTo(cx + radius/2, cy + radius, cx + radius, cy);
        } else if (type === 'triangle') {
            ctx.moveTo(cx - radius, cy + radius/2);
            ctx.lineTo(cx - radius/2, cy - radius/2);
            ctx.lineTo(cx + radius/2, cy + radius/2);
            ctx.lineTo(cx + radius, cy - radius/2);
        }
        ctx.stroke();
        ctx.restore();
    }

    drawConnectors(ctx, hovered) {
        const isHovered = (type, name) => hovered && hovered.module === this && hovered.connector.type === type && hovered.connector.name === name;
        const connectorRadius = 8;
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#E0E0E0';

        // Draw Inputs
        Object.entries(this.inputs).forEach(([name, props]) => {
            const x = props.x;
            const y = props.y;
            ctx.beginPath();
            ctx.arc(x, y, connectorRadius, 0, Math.PI * 2);
            ctx.fillStyle = isHovered('input', name) ? 'white' : '#4a90e2';
            ctx.fill();
            ctx.fillStyle = '#E0E0E0';
            ctx.fillText(name, x, y + connectorRadius + 12);
        });

        // Draw Outputs
        Object.entries(this.outputs).forEach(([name, props]) => {
            const x = props.x;
            const y = props.y;
            ctx.beginPath();
            ctx.arc(x, y, connectorRadius, 0, Math.PI * 2);
            ctx.fillStyle = isHovered('output', name) ? 'white' : '#222';
            ctx.fill();
            ctx.strokeStyle = '#4a90e2';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.fillStyle = '#E0E0E0';
            ctx.textAlign = 'right';
            ctx.fillText('SALIDA', x - connectorRadius - 4, y + 4);
        });
    }

    // Modificar handleClick para incluir la interacción del detune
    handleClick(x, y) {
        // Lógica de cambio de forma de onda
        const symbolX = this.x + this.width / 2;
        const symbolY = this.y + 75;
        const distWaveform = Math.sqrt(Math.pow(x - symbolX, 2) + Math.pow(y - symbolY, 2));
        if (distWaveform < 25) {
            this.currentWaveformIndex = (this.currentWaveformIndex + 1) % this.waveforms.length;
            this.setWaveform(this.waveforms[this.currentWaveformIndex]);
            return true;
        }
        return false;
    }

    // Nuevo: checkInteraction para el slider de detune
    checkInteraction(worldPos) {
        const detuneControlY = this.y + 115; // Coincidir con la Y del dibujo
        const sliderX = this.x + 10;
        const sliderWidth = this.width - 20;
        const knobRadius = 8;

        // Comprobar si el clic está en el pomo del slider de detune
        const normalizedDetune = (this.detuneValue + 50) / 100;
        const knobCurrentX = sliderX + (sliderWidth * normalizedDetune);

        const distKnob = Math.sqrt(
            Math.pow(worldPos.x - knobCurrentX, 2) +
            Math.pow(worldPos.y - (detuneControlY + knobRadius / 2), 2)
        );

        if (distKnob < knobRadius + 5) { // Un poco de margen de clic
            this.isDraggingDetune = true;
            return true; // Indica que se ha iniciado una interacción
        }
        return false;
    }

    // Nuevo: handleDragInteraction para mover el slider de detune
    handleDragInteraction(worldPos) { // Ahora recibe el objeto worldPos completo
        if (this.isDraggingDetune) {
            const sliderOffsetX = 10; // Offset local del slider dentro del módulo
            const sliderWidth = this.width - 20;
            
            // Calcula la posición relativa del clic dentro del slider
            const relativeX = worldPos.x - (this.x + sliderOffsetX);
            
            // Convierte la posición relativa a un valor normalizado (0 a 1)
            const normalizedValue = Math.max(0, Math.min(1, relativeX / sliderWidth));
            
            // Mapea el valor normalizado al rango de detune (-50 a 50)
            const newDetune = (normalizedValue * 100) - 50;
            this.setDetune(newDetune);
        }
    }

    // Nuevo: endInteraction para el slider de detune
    endInteraction() {
        this.isDraggingDetune = false;
    }


    getConnectorAt(x, y) {
        const connectorRadius = 9;
        // Convertir coordenadas del mundo a coordenadas relativas al módulo
        const localX = x - this.x;
        const localY = y - this.y;

        for (const [name, props] of Object.entries(this.inputs)) {
            const dist = Math.sqrt(Math.pow(localX - props.x, 2) + Math.pow(localY - props.y, 2));
            if (dist < connectorRadius) return { name, type: 'input', props, module: this };
        }
        for (const [name, props] of Object.entries(this.outputs)) {
            const dist = Math.sqrt(Math.pow(localX - props.x, 2) + Math.pow(localY - props.y, 2));
            if (dist < connectorRadius) return { name, type: 'output', props, module: this };
        }
        return null;
    }
    
    disconnect() {
        this.oscillator.disconnect();
        this.noise.disconnect();
        this.output.disconnect();
        // Asegurarse de desconectar AudioParams si alguna vez los conectas a otras fuentes CV
        // Actualmente, solo son destinos, así que no es necesario desconectarlos de aquí.
    }
    
    getState() {
        return {
            id: this.id, // Guardar ID
            type: 'VCO',
            x: this.x,
            y: this.y,
            waveform: this.waveforms[this.currentWaveformIndex],
            detuneValue: this.detuneValue // Guardar el valor del detune
        };
    }

    setState(state) {
        this.x = state.x ?? this.x;
        this.y = state.y ?? this.y;
        this.id = state.id || this.id; // Cargar ID

        const wfIndex = this.waveforms.indexOf(state.waveform);
        this.currentWaveformIndex = (wfIndex !== -1) ? wfIndex : 0;
        this.setWaveform(this.waveforms[this.currentWaveformIndex]);

        // Cargar y aplicar el valor del detune
        if (state.detuneValue !== undefined) {
            this.setDetune(state.detuneValue);
        }
    }
}