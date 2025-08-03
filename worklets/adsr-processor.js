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

    constructor() {
        super();
        this.phase = 'idle';
        this.value = 0.0;
        this.gate = false;
    }

    // Calcula el coeficiente para una curva exponencial que se acerca a un objetivo.
    // Un valor de 'targetRatio' más pequeño hace que la curva se acerque más al valor final.
    calculateCoefficient(timeInSeconds, targetRatio = 0.001) {
        // Evita la división por cero si el tiempo es instantáneo.
        if (timeInSeconds <= 0) return 0.0;
        return Math.exp(-Math.log(1 / targetRatio) / (timeInSeconds * sampleRate));
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const gateInput = inputs[0];

        const attackValues = parameters.attack;
        const decayValues = parameters.decay;
        const sustainValues = parameters.sustain;
        const releaseValues = parameters.release;

        for (let i = 0; i < output[0].length; i++) {
            const gateValue = gateInput[0] ? gateInput[0][i] : 0;

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
            output[0][i] = this.value;
        }
        return true;
    }
}

registerProcessor('adsr-processor', ADSRProcessor);