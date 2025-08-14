/* global currentTime */
// worklets/clock-processor.js

class ClockProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [];
    }
    constructor() {
        super();
        this._params = {};
        this._nextTickTime = 0;
        this._isRunning = false;
        this._justStarted = false;

        this.port.onmessage = (e) => {
            if (e.data.type === 'config') {
                const wasRunning = this._isRunning;
                this._params = e.data.params;
                this._isRunning = this._params.running;

                if (this._isRunning && !wasRunning) {
                    this._justStarted = true;
                } else if (!this._isRunning && wasRunning) {
                    // Resetear si se detiene
                    this._nextTickTime = 0;
                }
            }
        };
    }

    process(inputs, outputs) {
        if (!outputs || outputs.length === 0 || outputs[0].length === 0) {
            // Esto no debería ocurrir si outputChannelCount está configurado correctamente
            // Pero lo añadimos para depuración
            console.warn("ClockProcessor: outputs array is empty or malformed.", outputs);
            return true;
        }
        const output = outputs[0];
        const outputChannel = output[0]; // Acceder al primer canal de la primera salida

        if (this._justStarted) {
            this._nextTickTime = currentTime;
            this._justStarted = false;
        }

        if (!this._isRunning) {
            // Si no está corriendo, la salida es 0
            for (let i = 0; i < outputChannel.length; i++) {
                outputChannel[i] = 0;
            }
            return true;
        }

        const tickInterval = 60 / (this._params.tempo * 4); // 4 pulsos por negra (PPQN = 4)

        for (let i = 0; i < outputChannel.length; i++) {
            const currentFrameTime = currentTime + i / sampleRate;

            if (currentFrameTime >= this._nextTickTime) {
                outputChannel[i] = 1.0; // Pulso alto
                this._nextTickTime += tickInterval;
            } else {
                outputChannel[i] = 0.0; // Pulso bajo
            }
        }

        return true;
    }
}

registerProcessor('clock-processor', ClockProcessor);
