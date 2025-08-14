// src/worklets/vco-processor.js
class VCOProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'frequency', defaultValue: 440, minValue: 20, maxValue: 20000 },
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
        this.waveform = 2; // Default a sawtooth
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
        const detuneParam = parameters.detune;
        const pwParam = parameters.pulseWidth;
        const pwmParam = parameters.pwm;
        const fm1Param = parameters.fm1;
        const fm2Param = parameters.fm2;

        for (let i = 0; i < outputChannel.length; i++) {
            const baseFreq = freqParam.length > 1 ? freqParam[i] : freqParam[0];
            const vOct = vOctParam.length > 1 ? vOctParam[i] : vOctParam[0];
            const detune = detuneParam.length > 1 ? detuneParam[i] : detuneParam[0];
            const fm1 = fm1Param.length > 1 ? fm1Param[i] : fm1Param[0];
            const fm2 = fm2Param.length > 1 ? fm2Param[i] : fm2Param[0];
            const fmMod = (fm1 + fm2) * baseFreq;
            const finalFreq = (baseFreq + fmMod) * Math.pow(2, vOct + (detune / 1200));
            const step = finalFreq / sampleRate;

            const pulseWidth = pwParam.length > 1 ? pwParam[i] : pwParam[0];
            const pwm = pwmParam.length > 1 ? pwmParam[i] : pwmParam[0];
            const finalPW = Math.max(0.01, Math.min(0.99, pulseWidth + pwm * 0.5));

            let value = 0;
            const waveformIndex = Math.round(this.waveform);

            switch (waveformIndex) {
                case 0: // Sine
                    value = Math.sin(2 * Math.PI * this.phase);
                    break;
                case 1: // Square
                    value = this.phase < finalPW ? 1.0 : -1.0;
                    value += this.poly_blep(this.phase, step);
                    value -= this.poly_blep((this.phase + (1.0 - finalPW)) % 1.0, step);
                    break;
                case 2: // Sawtooth
                    value = 2.0 * this.phase - 1.0;
                    value -= this.poly_blep(this.phase, step);
                    break;
                case 3: { // Triangle
                    let square = this.phase < finalPW ? 1.0 : -1.0;
                    square += this.poly_blep(this.phase, step);
                    square -= this.poly_blep((this.phase + (1.0 - finalPW)) % 1.0, step);
                    value = step * square + (1 - step) * this.lastOutput;
                    this.lastOutput = value;
                    // --- CORRECCIÓN DE VOLUMEN ---
                    value *= 4.0; // Aumentar la amplitud de la triangular
                    break;
                }
            }

            outputChannel[i] = value * 0.5; // Ajuste de ganancia general
            this.phase = (this.phase + step) % 1.0;
        }

        return true;
    }
}

registerProcessor('vco-processor', VCOProcessor);