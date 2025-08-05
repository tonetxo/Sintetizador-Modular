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

    calculateCoefficient(timeInSeconds, targetRatio = 0.001) {
        if (timeInSeconds <= 0) return 0.0;
        return Math.exp(-Math.log(1 / targetRatio) / (timeInSeconds * sampleRate));
    }

    process(inputs, outputs, parameters) {
        const outputChannel = outputs[0]?.[0];
        if (!outputChannel) {
            return true;
        }

        const gateChannel = inputs[0]?.[0];

        // --- CAMBIO: Acceso seguro a todos los parámetros ---
        // Si un parámetro es `undefined`, le asignamos un array con su valor por defecto.
        // Esto previene el error si .process() se ejecuta antes de que los parámetros estén listos.
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
            
            // Esta línea ahora es segura porque `sustainValues` siempre será un array.
            const sustainLevel = sustainValues.length > 1 ? sustainValues[i] : sustainValues[0];

            switch (this.phase) {
                case 'attack': {
                    const attackTime = attackValues.length > 1 ? attackValues[i] : attackValues[0];
                    const attackCoeff = this.calculateCoefficient(attackTime);
                    this.value = 1.0 + (this.value - 1.0) * attackCoeff;
                    if (this.value >= 0.999) {
                        this.value = 1.0;
                        this.phase = 'decay';
                    }
                    break;
                }
                case 'decay': {
                    const decayTime = decayValues.length > 1 ? decayValues[i] : decayValues[0];
                    const decayCoeff = this.calculateCoefficient(decayTime);
                    this.value = sustainLevel + (this.value - sustainLevel) * decayCoeff;
                    if (this.value <= sustainLevel) {
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
                    this.value = this.value * releaseCoeff;
                    if (this.value <= 0.0001) {
                        this.value = 0.0;
                        this.phase = 'idle';
                    }
                    break;
                }
                case 'idle': {
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