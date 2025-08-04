// worklets/vco-processor.js
class VCOProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'frequency', defaultValue: 440, minValue: 20, maxValue: 20000 },
            { name: 'pulseWidth', defaultValue: 0.5, minValue: 0.01, maxValue: 0.99 },
            { name: 'vOct', defaultValue: 0, minValue: -10, maxValue: 10 },
            { name: 'detune', defaultValue: 0, minValue: -1200, maxValue: 1200 }, // in cents
            { name: 'pwm', defaultValue: 0, minValue: -1, maxValue: 1 },
            { name: 'fm1', defaultValue: 0, minValue: -1, maxValue: 1 },
            { name: 'fm2', defaultValue: 0, minValue: -1, maxValue: 1 }
        ];
    }

    constructor() {
        super();
        this.phase = 0;
        this.waveform = 2; // Default to sawtooth (index 2)

        // Variables para el filtro de eliminación de DC offset
        this._dcOffset = 0;
        this._dcOffsetPrev = 0;

        this.port.onmessage = (event) => {
            if (event.data.type === 'waveform') {
                this.waveform = event.data.value;
            }
        };
    }

    process(inputs, outputs, parameters) {
        // Asegurarse de que outputs y outputChannel sean válidos
        if (!outputs || outputs.length === 0 || !outputs[0] || outputs[0].length === 0) {
            return true;
        }
        const outputChannel = outputs[0][0];
        
        // Asegurarse de que el objeto parameters sea válido
        if (!parameters) {
            return true; 
        }

        // Asegurarse de que cada parámetro sea un Float32Array válido, o usar un valor por defecto
        const freqParam = parameters.frequency || new Float32Array([440]);
        const vOctParam = parameters.vOct || new Float32Array([0]);
        const detuneParam = parameters.detune || new Float32Array([0]);
        const pwParam = parameters.pulseWidth || new Float32Array([0.5]);
        const pwmParam = parameters.pwm || new Float32Array([0]);
        const fm1Param = parameters.fm1 || new Float32Array([0]);
        const fm2Param = parameters.fm2 || new Float32Array([0]);

        for (let i = 0; i < outputChannel.length; i++) {
            const baseFreq = freqParam.length > 1 ? freqParam[i] : freqParam[0];
            const vOct = vOctParam.length > 1 ? vOctParam[i] : vOctParam[0];
            const detune = detuneParam.length > 1 ? detuneParam[i] : detuneParam[0];
            const pulseWidth = pwParam.length > 1 ? pwParam[i] : pwParam[0];
            const pwm = pwmParam.length > 1 ? pwmParam[i] : pwmParam[0];
            const fm1 = fm1Param.length > 1 ? fm1Param[i] : fm1Param[0];
            const fm2 = fm2Param.length > 1 ? fm2Param[i] : fm2Param[0];

            // Calcular la frecuencia final combinando frecuencia base, 1V/Oct, detune y FM
            const fmMod = (fm1 + fm2) * baseFreq; // La modulación de frecuencia es relativa a la frecuencia base
            const finalFreq = (baseFreq + fmMod) * Math.pow(2, vOct + (detune / 1200));
            const step = finalFreq / sampleRate;

            let value = 0;
            const finalPW = Math.max(0.01, Math.min(0.99, pulseWidth + pwm * 0.5));

            switch (Math.round(this.waveform)) {
                case 0: // Sine
                    value = Math.sin(2 * Math.PI * this.phase);
                    break;
                case 1: // Square (DC-compensated)
                    value = this.phase < finalPW ? 1.0 : -1.0;
                    break;
                case 2: // Sawtooth (DC-compensated)
                    value = 2.0 * this.phase - 1.0;
                    break;
                case 3: // Triangle (DC-compensated)
                    value = 1.0 - 4.0 * Math.abs(0.5 - this.phase);
                    break;
            }
            
            // Aplicar filtro de eliminación de DC offset
            const filteredValue = value - this._dcOffset + (this._dcOffsetPrev * 0.99);
            this._dcOffsetPrev = this._dcOffset;
            this._dcOffset = value;

            outputChannel[i] = filteredValue * 0.2;
            this.phase = (this.phase + step) % 1.0;
        }

        return true;
    }
}

registerProcessor('vco-processor', VCOProcessor);