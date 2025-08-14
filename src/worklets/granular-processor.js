// src/worklets/granular-processor.js

class GranularProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'position', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'a-rate' },
            { name: 'grainSize', defaultValue: 0.1, minValue: 0.01, maxValue: 0.5, automationRate: 'k-rate' },
            { name: 'grainRate', defaultValue: 10, minValue: 1, maxValue: 100, automationRate: 'k-rate' },
            { name: 'pitch', defaultValue: 1, minValue: 0.25, maxValue: 4, automationRate: 'k-rate' },
            { name: 'spread', defaultValue: 0.1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
            { name: 'randomness', defaultValue: 0.1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
            { name: 'pitchShift', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
            // --- NUEVO PARÁMETRO AÑADIDO ---
            { name: 'stereoSpread', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
        ];
    }

    constructor() {
        super();
        this.buffer = null;
        this.grains = new Set();
        this.nextGrainId = 0;
        this.samplesUntilNextGrain = 0;
        
        this.sampleRate = sampleRate;
        this.maxGrains = 64;
        
        this.windowSize = 2048;
        this.window = new Float32Array(this.windowSize);
        for (let i = 0; i < this.windowSize; i++) {
            this.window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (this.windowSize - 1)));
        }

        this.port.onmessage = (e) => {
            if (e.data.type === 'audioBuffer') {
                this.buffer = e.data.buffer;
                this.grains.clear();
            }
        };
    }

    createGrain(params) {
        if (!this.buffer || this.grains.size >= this.maxGrains) return;

        const grainSizeInSamples = params.grainSize * this.sampleRate;
        const basePosition = params.position * (this.buffer.length - grainSizeInSamples);
        
        const spreadOffset = (Math.random() * 2 - 1) * params.spread * grainSizeInSamples;
        const randomPositionOffset = (Math.random() * 2 - 1) * params.randomness * this.sampleRate * 0.1;
        
        let startPosition = basePosition + spreadOffset + randomPositionOffset;
        startPosition = Math.max(0, Math.min(startPosition, this.buffer.length - grainSizeInSamples));

        const grain = {
            id: this.nextGrainId++,
            startPosition: startPosition,
            life: 0,
            playbackPosition: 0,
            size: grainSizeInSamples,
            pitch: params.pitch,
            // --- NUEVA PROPIEDAD AÑADIDA ---
            // Asignamos una posición de paneo aleatoria a cada grano
            pan: (Math.random() * 2 - 1) * params.stereoSpread,
        };

        this.grains.add(grain);
    }
    
    process(inputs, outputs, parameters) {
        if (!this.buffer) return true;

        const output = outputs[0];
        // --- CAMBIO: AHORA TENEMOS CANAL IZQUIERDO Y DERECHO ---
        const outputL = output[0];
        const outputR = output[1];
        const blockSize = outputL.length;

        // --- CAMBIO: Reiniciar ambos buffers de salida ---
        outputL.fill(0);
        outputR.fill(0);

        for (let i = 0; i < blockSize; i++) {
            if (this.samplesUntilNextGrain <= 0) {
                this.createGrain({
                    grainSize: parameters.grainSize[0],
                    position: parameters.position.length > 1 ? parameters.position[i] : parameters.position[0],
                    pitch: parameters.pitch[0],
                    spread: parameters.spread[0],
                    randomness: parameters.randomness[0],
                    // --- CAMBIO: Pasar el nuevo parámetro ---
                    stereoSpread: parameters.stereoSpread[0],
                });
                const grainRate = parameters.grainRate[0];
                this.samplesUntilNextGrain += this.sampleRate / grainRate;
            }
            this.samplesUntilNextGrain--;
            
            let currentSampleL = 0;
            let currentSampleR = 0;
            const pitchShiftMode = parameters.pitchShift[0] > 0.5;

            for (const grain of this.grains) {
                if (grain.life >= grain.size) continue;

                let bufferReadPos;
                let envelopePosition = grain.life;
                
                if (pitchShiftMode) {
                    grain.life++;
                    bufferReadPos = grain.startPosition + grain.playbackPosition;
                    grain.playbackPosition += grain.pitch;
                } else {
                    grain.life += grain.pitch;
                    envelopePosition = grain.life;
                    bufferReadPos = grain.startPosition + grain.life;
                }
                
                if (bufferReadPos >= 0 && bufferReadPos < this.buffer.length - 1) {
                    const index1 = Math.floor(bufferReadPos);
                    const index2 = index1 + 1;
                    const frac = bufferReadPos - index1;

                    const sample1 = this.buffer[index1] || 0;
                    const sample2 = this.buffer[index2] || 0;
                    const interpolatedSample = sample1 + frac * (sample2 - sample1);

                    const windowPos = (envelopePosition / grain.size) * this.windowSize;
                    const windowIndex = Math.floor(windowPos);

                    if(windowIndex >= 0 && windowIndex < this.windowSize) {
                        const windowAmp = this.window[windowIndex];
                        const finalSample = interpolatedSample * windowAmp;

                        // --- CAMBIO: Aplicar paneo de potencia constante ---
                        const panAngle = (grain.pan * 0.5 + 0.5) * (Math.PI / 2);
                        const gainL = Math.cos(panAngle);
                        const gainR = Math.sin(panAngle);

                        currentSampleL += finalSample * gainL;
                        currentSampleR += finalSample * gainR;
                    }
                }
            }
            outputL[i] = currentSampleL;
            outputR[i] = currentSampleR;
        }

        for (const grain of this.grains) {
            if (grain.life >= grain.size) {
                this.grains.delete(grain);
            }
        }
        
        const numGrains = this.grains.size;
        if (numGrains > 1) {
            const scale = 1 / Math.sqrt(numGrains);
            for (let i = 0; i < blockSize; i++) {
                outputL[i] *= scale;
                outputR[i] *= scale;
            }
        }
        
        return true;
    }
}

registerProcessor('granular-processor', GranularProcessor);