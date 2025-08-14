// src/worklets/lfo-processor.js
class LFOProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'frequency', defaultValue: 5, minValue: 0.01, maxValue: 1000 },
            { name: 'detune', defaultValue: 0, minValue: -100, maxValue: 100 },
            { name: 'pulseWidth', defaultValue: 0.5, minValue: 0.01, maxValue: 0.99 },
            { name: 'vOct', defaultValue: 0, automationRate: 'a-rate' },
            { name: 'pwm', defaultValue: 0, automationRate: 'a-rate' },
            { name: 'fm1', defaultValue: 0, automationRate: 'a-rate' },
            { name: 'fm2', defaultValue: 0, automationRate: 'a-rate' }
        ];
    }

    constructor() {
        super();
        this.phase = 0;
        this.waveform = 0; // Default a sine
        this.lastOutput = 0;

        this.port.onmessage = (event) => {
            if (event.data.type === 'waveform') {
                this.waveform = event.data.value;
            }
        };
    }

    poly_blep(t, dt) {
        if (t < dt) { t /= dt; return t + t - t * t - 1.0; }
        if (t > 1.0 - dt) { t = (t - 1.0) / dt; return t * t + t + t + 1.0; }
        return 0.0;
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        if (!output || !output[0]) { return true; }
        const outputChannel = output[0];

        const freqParam = parameters.frequency;
        const vOctParam = parameters.vOct;
        
        for (let i = 0; i < outputChannel.length; i++) {
            const baseFreq = freqParam.length > 1 ? freqParam[i] : freqParam[0];
            const vOct = vOctParam.length > 1 ? vOctParam[i] : vOctParam[0];
            const finalFreq = baseFreq * Math.pow(2, vOct);
            const step = finalFreq / sampleRate;

            let value = 0;
            const waveformIndex = Math.round(this.waveform);

            switch (waveformIndex) {
                case 0: // Sine
                    value = Math.sin(2 * Math.PI * this.phase);
                    break;
                case 1: // Square
                    value = this.phase < 0.5 ? 1.0 : -1.0;
                    value += this.poly_blep(this.phase, step);
                    value -= this.poly_blep((this.phase + 0.5) % 1.0, step);
                    break;
                case 2: // Sawtooth
                    value = 2.0 * this.phase - 1.0;
                    value -= this.poly_blep(this.phase, step);
                    break;
                case 3: { // Triangle
                    let square = this.phase < 0.5 ? 1.0 : -1.0;
                    square += this.poly_blep(this.phase, step);
                    square -= this.poly_blep((this.phase + 0.5) % 1.0, step);
                    value = step * square + (1 - step) * this.lastOutput;
                    this.lastOutput = value;
                    // --- CORRECCIÓN DE VOLUMEN ---
                    value *= 4.0;
                    break;
                }
            }

            outputChannel[i] = value;
            this.phase = (this.phase + step) % 1.0;
        }

        return true;
    }
}

registerProcessor('lfo-processor', LFOProcessor);