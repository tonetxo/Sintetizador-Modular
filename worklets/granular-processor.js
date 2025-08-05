// worklets/granular-processor.js

class GranularProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'trigger', defaultValue: 0, minValue: 0, maxValue: 1 },
            { name: 'position', defaultValue: 0.0, minValue: 0.0, maxValue: 1.0 },
            { name: 'grainSize', defaultValue: 0.1, minValue: 0.005, maxValue: 0.5 },
            { name: 'grainRate', defaultValue: 20.0, minValue: 1, maxValue: 100 },
            { name: 'pitch', defaultValue: 1.0, minValue: 0.1, maxValue: 4.0 },
            { name: 'jitter', defaultValue: 0.0, minValue: 0.0, maxValue: 1.0 },
        ];
    }

    constructor() {
        super();
        this._audioBuffer = null;
        this._activeGrains = [];
        this._samplesUntilNextGrain = 0;
        this._lastGateValue = 0;

        this.port.onmessage = (e) => {
            if (e.data.type === 'audioBuffer') {
                this._audioBuffer = e.data.buffer;
                // Resetear estado al cargar nuevo buffer
                this._activeGrains = [];
                this._samplesUntilNextGrain = 0;
            }
        };
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0][0];
        if (!this._audioBuffer) {
            output.fill(0);
            return true; // No hacer nada si no hay buffer de audio
        }

        const bufferLength = this._audioBuffer.length;
        const blockSize = output.length; // 128 samples

        for (let i = 0; i < blockSize; i++) {
            // Obtener parámetros para este sample (k-rate o a-rate)
            const getParam = (name, index) => parameters[name].length > 1 ? parameters[name][index] : parameters[name][0];

            const position = getParam('position', i);
            const grainSize = getParam('grainSize', i);
            const grainRate = getParam('grainRate', i);
            const pitch = getParam('pitch', i);
            const jitter = getParam('jitter', i);
            const trigger = getParam('trigger', i);

            // Spawning de nuevos granos
            if (trigger > 0.5 && this._lastGateValue <= 0.5) { // Si hay un trigger por Gate
                 this._spawnGrain(bufferLength, position, grainSize, pitch, jitter);
            } else if (trigger <= 0.5) { // Si está en modo continuo
                if (this._samplesUntilNextGrain <= 0) {
                    this._spawnGrain(bufferLength, position, grainSize, pitch, jitter);
                    this._samplesUntilNextGrain += sampleRate / grainRate;
                }
                this._samplesUntilNextGrain--;
            }
            this._lastGateValue = trigger;

            // Procesar y sumar granos activos
            let outputSample = 0;
            for (let j = this._activeGrains.length - 1; j >= 0; j--) {
                const grain = this._activeGrains[j];
                
                // Envolvente de grano (ventana de Hann para evitar clics)
                const window = Math.sin(Math.PI * (grain.playhead / grain.duration));
                
                // Interpolación lineal simple para la lectura del buffer
                const floorIndex = Math.floor(grain.readhead);
                const fraction = grain.readhead - floorIndex;
                const s1 = this._audioBuffer[floorIndex] || 0;
                const s2 = this._audioBuffer[floorIndex + 1] || 0;
                const sample = (s1 + (s2 - s1) * fraction);
                
                outputSample += sample * window * 0.5; // El 0.5 es para evitar clipping

                grain.playhead++;
                grain.readhead += grain.pitch;

                if (grain.playhead >= grain.duration) {
                    this._activeGrains.splice(j, 1); // Eliminar grano terminado
                }
            }
            output[i] = outputSample;
        }

        return true;
    }

    _spawnGrain(bufferLength, position, grainSize, pitch, jitter) {
        const jitterAmount = (Math.random() - 0.5) * jitter * 0.5;
        const startPosition = Math.max(0, Math.min(1.0, position + jitterAmount));
        
        const grain = {
            readhead: startPosition * bufferLength,
            playhead: 0,
            duration: Math.floor(grainSize * sampleRate),
            pitch: pitch,
        };
        this._activeGrains.push(grain);
    }
}

registerProcessor('granular-processor', GranularProcessor);
