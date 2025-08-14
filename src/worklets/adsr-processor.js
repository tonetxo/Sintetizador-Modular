// worklets/adsr-processor.js
class ADSRProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'attack', defaultValue: 0.01, minValue: 0.001, maxValue: 10 },
            { name: 'decay', defaultValue: 0.1, minValue: 0.001, maxValue: 10 },
            { name: 'sustain', defaultValue: 0.8, minValue: 0, maxValue: 1 },
            { name: 'release', defaultValue: 0.2, minValue: 0.001, maxValue: 10 },
        ];
    }

    constructor(options) {
        super(options);
        this.phase = 'idle';
        this.value = 0.0;
        this.gate = false;
    }

    calculateCoefficient(timeInSeconds, targetRatio = 0.0001) { // Rampa más agresiva
        if (timeInSeconds <= 0) return 0.0;
        return Math.exp(-Math.log(1 / targetRatio) / (timeInSeconds * sampleRate));
    }

    process(inputs, outputs, parameters) {
        const outputChannel = outputs[0]?.[0];
        if (!outputChannel) {
            return true;
        }

        const gateChannel = inputs[0]?.[0];
        const attackValues = parameters.attack ?? [0.01];
        const decayValues = parameters.decay ?? [0.1];
        const sustainValues = parameters.sustain ?? [0.8];
        const releaseValues = parameters.release ?? [0.2];

        for (let i = 0; i < outputChannel.length; i++) {
            const gateValue = gateChannel?.[i] ?? 0;

            if (gateValue > 0.5 && !this.gate) {
                this.gate = true;
                this.phase = 'attack';
            } else if (gateValue <= 0.5 && this.gate) {
                this.gate = false;
                this.phase = 'release';
            }
            
            const sustainLevel = sustainValues.length > 1 ? sustainValues[i] : sustainValues[0];

            switch (this.phase) {
                case 'attack': {
                    const attackTime = attackValues.length > 1 ? attackValues[i] : attackValues[0];
                    const attackCoeff = this.calculateCoefficient(attackTime);
                    this.value = 1.0 + (this.value - 1.0) * attackCoeff;
                    if (this.value >= 0.9999) {
                        this.value = 1.0;
                        this.phase = 'decay';
                    }
                    break;
                }
                case 'decay': {
                    const decayTime = decayValues.length > 1 ? decayValues[i] : decayValues[0];
                    const decayCoeff = this.calculateCoefficient(decayTime);
                    this.value = sustainLevel + (this.value - sustainLevel) * decayCoeff;
                    if (Math.abs(this.value - sustainLevel) < 1e-5) {
                        this.value = sustainLevel;
                        this.phase = 'sustain';
                    }
                    break;
                }
                case 'sustain': {
                    this.value = sustainLevel;
                    break;
                }
                case 'release': {
                    const releaseTime = releaseValues.length > 1 ? releaseValues[i] : releaseValues[0];
                    const releaseCoeff = this.calculateCoefficient(releaseTime);
                    this.value *= releaseCoeff;
                    // --- CORRECCIÓN --- Umbral más bajo para asegurar el silencio
                    if (this.value < 1e-6) {
                        this.value = 0.0;
                        this.phase = 'idle';
                    }
                    break;
                }
                case 'idle': {
                    // --- CORRECCIÓN --- Forzar a cero absoluto mientras esté inactivo
                    this.value = 0.0;
                    break;
                }
            }
            outputChannel[i] = this.value;
        }
        return true;
    }
}

registerProcessor('adsr-processor', ADSRProcessor);