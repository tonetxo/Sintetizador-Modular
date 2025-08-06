// worklets/vco-processor.js
class LFOProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        // Tus descriptores de parámetros se mantienen, están bien definidos.
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
        this.waveform = 2; // Default a sawtooth
        this.lastOutput = 0; // Para el integrador de la onda triangular

        this.port.onmessage = (event) => {
            if (event.data.type === 'waveform') {
                this.waveform = event.data.value;
            }
        };
    }

    /**
     * Técnica PolyBLEP para antialiasing.
     * Suaviza las discontinuidades en las formas de onda.
     * @param {number} t - La fase actual (0 a 1).
     * @param {number} dt - El incremento de fase por muestra (step).
     * @returns {number} - El valor de corrección.
     */
    poly_blep(t, dt) {
        if (t < dt) {
            t /= dt;
            return t + t - t * t - 1.0;
        } else if (t > 1.0 - dt) {
            t = (t - 1.0) / dt;
            return t * t + t + t + 1.0;
        }
        return 0.0;
    }

    process(inputs, outputs, parameters) {
        const outputChannel = outputs[0][0];

        // Se mantiene tu lógica para obtener parámetros de forma segura
        const freqParam = parameters.frequency;
        const vOctParam = parameters.vOct;
        const detuneParam = parameters.detune;
        const pwParam = parameters.pulseWidth;
        const pwmParam = parameters.pwm;
        const fm1Param = parameters.fm1;
        const fm2Param = parameters.fm2;

        for (let i = 0; i < outputChannel.length; i++) {
            // --- Se mantiene tu lógica de cálculo de frecuencia ---
            const baseFreq = freqParam.length > 1 ? freqParam[i] : freqParam[0];
            const vOct = vOctParam.length > 1 ? vOctParam[i] : vOctParam[0];
            const detune = detuneParam.length > 1 ? detuneParam[i] : detuneParam[0];
            const fm1 = fm1Param.length > 1 ? fm1Param[i] : fm1Param[0];
            const fm2 = fm2Param.length > 1 ? fm2Param[i] : fm2Param[0];
            const fmMod = (fm1 + fm2) * baseFreq;
            const finalFreq = (baseFreq + fmMod) * Math.pow(2, vOct + (detune / 1200));
            const step = finalFreq / sampleRate;
            // --- Fin de tu lógica ---

            const pulseWidth = pwParam.length > 1 ? pwParam[i] : pwParam[0];
            const pwm = pwmParam.length > 1 ? pwmParam[i] : pwmParam[0];
            const finalPW = Math.max(0.01, Math.min(0.99, pulseWidth + pwm * 0.5));

            let value = 0;
            const waveformIndex = Math.round(this.waveform);

            // --- Generación de Ondas con Anti-Aliasing ---
            switch (waveformIndex) {
                case 0: // Sine (no necesita anti-aliasing)
                    value = Math.sin(2 * Math.PI * this.phase);
                    break;
                case 1: // Square (con PolyBLEP)
                    value = this.phase < finalPW ? 1.0 : -1.0;
                    value += this.poly_blep(this.phase, step);
                    value -= this.poly_blep((this.phase + (1.0 - finalPW)) % 1.0, step);
                    break;
                case 2: // Sawtooth (con PolyBLEP)
                    value = 2.0 * this.phase - 1.0;
                    value -= this.poly_blep(this.phase, step);
                    break;
                case 3: // Triangle (integrando una cuadrada band-limited)
                    let square = this.phase < finalPW ? 1.0 : -1.0;
                    square += this.poly_blep(this.phase, step);
                    square -= this.poly_blep((this.phase + (1.0 - finalPW)) % 1.0, step);
                    // Integrador con fuga para generar el triángulo
                    value = step * square + (1 - step) * this.lastOutput;
                    this.lastOutput = value;
                    break;
            }

            // El factor de ganancia de 0.8 es para normalizar la amplitud del triángulo, que puede ser más alta.
            // El 0.2 que tenías se mantiene para el control de volumen general.
            outputChannel[i] = value * 0.8 * 0.2;
            this.phase = (this.phase + step) % 1.0;
        }

        return true;
    }
}

registerProcessor('lfo-processor', LFOProcessor);