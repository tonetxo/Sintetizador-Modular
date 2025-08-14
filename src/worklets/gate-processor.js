// worklets/gate-processor.js
class GateProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this._lastGateValue = 0;
    }

    process(inputs) {
        const input = inputs[0];
        const inputChannel = input[0];

        if (inputChannel) {
            for (let i = 0; i < inputChannel.length; i++) {
                const currentValue = inputChannel[i];
                if (currentValue > 0 && this._lastGateValue <= 0) {
                    this.port.postMessage('gate-on');
                } else if (currentValue <= 0 && this._lastGateValue > 0) {
                    this.port.postMessage('gate-off');
                }
                this._lastGateValue = currentValue;
            }
        }
        
        return true;
    }
}

registerProcessor('gate-processor', GateProcessor);
