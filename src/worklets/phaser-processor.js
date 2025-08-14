/* global sampleRate */
// worklets/phaser-processor.js

class PhaserProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'rate', defaultValue: 0.5, minValue: 0.1, maxValue: 8 },
            { name: 'depth', defaultValue: 600, minValue: 100, maxValue: 1500 },
            { name: 'frequency', defaultValue: 800, minValue: 200, maxValue: 5000 },
            { name: 'feedback', defaultValue: 0.7, minValue: 0, maxValue: 0.95 },
        ];
    }

    constructor() {
        super();
        this.lfoPhase = 0;
        this.filters = [];
        this.lastFilterOutput = [];
        this.updateStages(4);
        
        this.port.onmessage = (event) => {
            if (event.data.type === 'stages') {
                this.updateStages(event.data.value);
            }
        };
    }

    updateStages(stages) {
        const numStages = Math.round(stages);
        this.filters = [];
        for (let i = 0; i < numStages; i++) {
            this.filters.push({ x_z1_L: 0, y_z1_L: 0, x_z1_R: 0, y_z1_R: 0 });
        }
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        const output = outputs[0];

        if (!input || input.length === 0 || !input[0]) {
            for (let i = 0; i < output.length; i++) {
                output[i].fill(0);
            }
            return true;
        }

        const rateValues = parameters.rate;
        const depthValues = parameters.depth;
        const frequencyValues = parameters.frequency;
        const feedbackValues = parameters.feedback;
        
        const numSamples = input[0].length;
        const numChannels = input.length;

        if (this.lastFilterOutput.length !== numChannels) {
            this.lastFilterOutput = new Array(numChannels).fill(0);
        }

        for (let i = 0; i < numSamples; i++) {
            const rate = rateValues.length > 1 ? rateValues[i] : rateValues[0];
            const depth = depthValues.length > 1 ? depthValues[i] : depthValues[0];
            const frequency = frequencyValues.length > 1 ? frequencyValues[i] : frequencyValues[0];
            const feedback = feedbackValues.length > 1 ? feedbackValues[i] : feedbackValues[0];
            
            const lfoIncrement = (2 * Math.PI * rate) / sampleRate;
            this.lfoPhase += lfoIncrement;
            if (this.lfoPhase > 2 * Math.PI) this.lfoPhase -= 2 * Math.PI;

            const lfoValue = Math.sin(this.lfoPhase);
            const centerFreq = frequency + lfoValue * depth;

            // Asegurarse de que centerFreq no cause problemas con tan()
            const safeCenterFreq = Math.max(20, Math.min(sampleRate / 2 - 1, centerFreq));
            const tan_val = Math.tan(Math.PI * safeCenterFreq / sampleRate);
            const a = (1 - tan_val) / (1 + tan_val);

            for (let channel = 0; channel < numChannels; channel++) {
                const inputSample = input[channel][i];
                const feedbackSignal = this.lastFilterOutput[channel] * feedback;
                let stageSignal = inputSample + feedbackSignal;

                for (let j = 0; j < this.filters.length; j++) {
                    const filter = this.filters[j];
                    const x_z1 = (channel === 0) ? filter.x_z1_L : filter.x_z1_R;
                    const y_z1 = (channel === 0) ? filter.y_z1_L : filter.y_z1_R;

                    let outputSample = a * (stageSignal - y_z1) + x_z1;
                    
                    // --- CORRECCIÓN DEFINITIVA ---
                    // Se aplica un clipper suave a la salida de CADA filtro.
                    // Esto previene la inestabilidad numérica que causa la distorsión y el silencio.
                    outputSample = Math.tanh(outputSample);

                    if (channel === 0) {
                        filter.x_z1_L = stageSignal;
                        filter.y_z1_L = outputSample;
                    } else {
                        filter.x_z1_R = stageSignal;
                        filter.y_z1_R = outputSample;
                    }
                    stageSignal = outputSample;
                }
                
                this.lastFilterOutput[channel] = stageSignal;
                
                const mixedSignal = (inputSample * 0.5) + (stageSignal * 0.5);
                output[channel][i] = mixedSignal;
            }
        }
        return true;
    }
}

registerProcessor('phaser-processor', PhaserProcessor);