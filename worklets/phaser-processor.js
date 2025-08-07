// worklets/phaser-processor.js
class PhaserProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'rate', defaultValue: 0.5, minValue: 0.1, maxValue: 8 },
            { name: 'depth', defaultValue: 600, minValue: 100, maxValue: 1500 },
            { name: 'frequency', defaultValue: 800, minValue: 200, maxValue: 5000 },
            { name: 'feedback', defaultValue: 0.7, minValue: 0, maxValue: 0.98 },
            { name: 'stages', defaultValue: 4, minValue: 2, maxValue: 12 }
        ];
    }

    constructor() {
        super();
        this.lfoPhase = 0;
        this.filters = [];
        this.updateStages(4); // Inicializar con 4 etapas por defecto
        
        this.port.onmessage = (event) => {
            if (event.data.type === 'stages') {
                this.updateStages(event.data.value);
            }
        };
    }

    updateStages(stages) {
        this.filters = [];
        for (let i = 0; i < stages; i++) {
            this.filters.push({ z1: 0 });
        }
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        const output = outputs[0];
        const rateValues = parameters.rate;
        const depthValues = parameters.depth;
        const frequencyValues = parameters.frequency;
        const feedbackValues = parameters.feedback;
        
        for (let channel = 0; channel < input.length; ++channel) {
            const inputChannel = input[channel];
            const outputChannel = output[channel];
            let lastFilterOutput = 0;

            for (let i = 0; i < inputChannel.length; ++i) {
                const rate = rateValues.length > 1 ? rateValues[i] : rateValues[0];
                const depth = depthValues.length > 1 ? depthValues[i] : depthValues[0];
                const frequency = frequencyValues.length > 1 ? frequencyValues[i] : frequencyValues[0];
                const feedback = feedbackValues.length > 1 ? feedbackValues[i] : feedbackValues[0];

                const lfoIncrement = (2 * Math.PI * rate) / sampleRate;
                this.lfoPhase += lfoIncrement;
                if (this.lfoPhase > 2 * Math.PI) {
                    this.lfoPhase -= 2 * Math.PI;
                }

                const lfoValue = Math.sin(this.lfoPhase);
                const centerFreq = frequency + lfoValue * depth;
                const d = -Math.cos((2 * Math.PI * centerFreq) / sampleRate);

                let stageSignal = inputChannel[i] + lastFilterOutput * feedback;

                for (let j = 0; j < this.filters.length; j++) {
                    const filter = this.filters[j];
                    const outputSignal = filter.z1 + stageSignal * -d;
                    filter.z1 = outputSignal * d + stageSignal;
                    stageSignal = outputSignal;
                }
                
                lastFilterOutput = stageSignal;
                outputChannel[i] = (inputChannel[i] + stageSignal) * 0.5;
            }
        }

        return true;
    }
}

registerProcessor('phaser-processor', PhaserProcessor);
