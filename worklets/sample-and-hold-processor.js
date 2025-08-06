// worklets/sample-and-hold-processor.js
class SampleAndHoldProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.heldValue = 0.0;
        this.lastTriggerValue = 0.0;
    }

    process(inputs, outputs) {
        const output = outputs[0];
        if (!output || output.length === 0 || !output[0]) {
            return true;
        }
        const outputChannel = output[0];

        const signalInput = inputs[0];
        const triggerInput = inputs[1];

        const signalChannel = signalInput && signalInput.length > 0 ? signalInput[0] : null;
        const triggerChannel = triggerInput && triggerInput.length > 0 ? triggerInput[0] : null;

        if (!triggerChannel) {
            for (let i = 0; i < outputChannel.length; i++) {
                outputChannel[i] = this.heldValue;
            }
            return true;
        }

        for (let i = 0; i < outputChannel.length; i++) {
            const triggerValue = triggerChannel[i];
            
            if (triggerValue > 0.5 && this.lastTriggerValue <= 0.5) {
                if (signalChannel && signalChannel[i] !== undefined) {
                    this.heldValue = signalChannel[i];
                }
            }
            this.lastTriggerValue = triggerValue;
            outputChannel[i] = this.heldValue;
        }

        return true;
    }
}

registerProcessor('sample-and-hold-processor', SampleAndHoldProcessor);