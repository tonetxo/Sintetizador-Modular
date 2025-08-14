class VocoderProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.port.onmessage = () => {
            // Handle messages from the main thread if needed
        };
    }

    process(inputs, outputs) {
        const carrierInput = inputs[0];
        const modulatorInput = inputs[1];
        const output = outputs[0];

        // If the output is not connected, do nothing.
        if (!output || !output[0]) {
            return true;
        }

        // Ensure both inputs are connected and have data
        if (!carrierInput || !modulatorInput || carrierInput.length === 0 || modulatorInput.length === 0 || !carrierInput[0] || !modulatorInput[0]) {
            // If not, output silence
            for (let channel = 0; channel < output.length; channel++) {
                output[channel].fill(0);
            }
            return true;
        }

        const carrierChannel = carrierInput[0];
        const modulatorChannel = modulatorInput[0];
        const outputChannel = output[0];

        // Placeholder: Mix carrier and modulator
        // A real vocoder would implement filter banks and envelope followers here.
        for (let i = 0; i < outputChannel.length; i++) {
            outputChannel[i] = (carrierChannel[i] || 0) * 0.5 + (modulatorChannel[i] || 0) * 0.5;
        }

        return true;
    }
}

registerProcessor('vocoder-processor', VocoderProcessor);
