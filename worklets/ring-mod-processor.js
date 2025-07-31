// worklets/ring-mod-processor.js
class RingModProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
    }

    process(inputs, outputs, parameters) {
        const input1 = inputs[0];
        const input2 = inputs[1];
        const output = outputs[0];

        if (input1.length > 0 && input2.length > 0) {
            const input1Channel = input1[0];
            const input2Channel = input2[0];
            const outputChannel = output[0];

            for (let i = 0; i < input1Channel.length; i++) {
                outputChannel[i] = input1Channel[i] * input2Channel[i];
            }
        } else if (input1.length > 0) { // If only input1 is connected, pass it through
            const input1Channel = input1[0];
            const outputChannel = output[0];
            for (let i = 0; i < input1Channel.length; i++) {
                outputChannel[i] = input1Channel[i];
            }
        } else if (input2.length > 0) { // If only input2 is connected, pass it through
            const input2Channel = input2[0];
            const outputChannel = output[0];
            for (let i = 0; i < input2Channel.length; i++) {
                outputChannel[i] = input2Channel[i];
            }
        }


        return true;
    }
}

registerProcessor('ring-mod-processor', RingModProcessor);
