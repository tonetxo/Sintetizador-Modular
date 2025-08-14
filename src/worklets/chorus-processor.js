// worklets/chorus-processor.js
class ChorusProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'rate', defaultValue: 1.5, minValue: 0.1, maxValue: 10 },
            { name: 'depth', defaultValue: 0.002, minValue: 0.0005, maxValue: 0.01 },
            { name: 'delay', defaultValue: 0.025, minValue: 0.01, maxValue: 0.05 },
            { name: 'feedback', defaultValue: 0.2, minValue: 0, maxValue: 0.95 }
        ];
    }

    constructor() {
        super();
        this.buffer = new Float32Array(sampleRate * 2); // Max delay de 2 segundos
        this.writeIndex = 0;
        this.lfoPhase = 0;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        const output = outputs[0];
        const rateValues = parameters.rate;
        const depthValues = parameters.depth;
        const delayValues = parameters.delay;
        const feedbackValues = parameters.feedback;

        for (let channel = 0; channel < input.length; ++channel) {
            const inputChannel = input[channel];
            const outputChannel = output[channel];

            for (let i = 0; i < inputChannel.length; ++i) {
                const rate = rateValues.length > 1 ? rateValues[i] : rateValues[0];
                const depth = depthValues.length > 1 ? depthValues[i] : depthValues[0];
                const delay = delayValues.length > 1 ? delayValues[i] : delayValues[0];
                const feedback = feedbackValues.length > 1 ? feedbackValues[i] : feedbackValues[0];

                const lfoIncrement = (2 * Math.PI * rate) / sampleRate;
                this.lfoPhase += lfoIncrement;
                if (this.lfoPhase > 2 * Math.PI) {
                    this.lfoPhase -= 2 * Math.PI;
                }
                
                const lfoValue = Math.sin(this.lfoPhase);
                const currentDelay = delay + lfoValue * depth;
                const readIndex = (this.writeIndex - currentDelay * sampleRate + this.buffer.length) % this.buffer.length;
                
                const intIndex = Math.floor(readIndex);
                const frac = readIndex - intIndex;
                
                const s0 = this.buffer[(intIndex + 0) % this.buffer.length];
                const s1 = this.buffer[(intIndex + 1) % this.buffer.length];
                
                const delayedSample = s0 + (s1 - s0) * frac;

                const inputSample = inputChannel[i];
                const feedbackSample = delayedSample * feedback;
                
                this.buffer[this.writeIndex] = inputSample + feedbackSample;

                outputChannel[i] = inputSample + delayedSample;

                this.writeIndex = (this.writeIndex + 1) % this.buffer.length;
            }
        }

        return true;
    }
}

registerProcessor('chorus-processor', ChorusProcessor);