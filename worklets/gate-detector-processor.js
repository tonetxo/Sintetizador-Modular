// worklets/gate-detector-processor.js
class GateDetectorProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: 'gate',
        defaultValue: 0,
        minValue: 0,
        maxValue: 1
      }
    ];
  }

  constructor() {
    super();
    this.lastGateValue = 0;
    this.port.onmessage = (e) => {
      // Handle messages if needed
    };
  }

  process(inputs, outputs, parameters) {
    const gate = parameters.gate;
    const output = outputs[0];
    
    for (let channel = 0; channel < output.length; channel++) {
      const outputChannel = output[channel];
      
      for (let i = 0; i < outputChannel.length; i++) {
        const currentGateValue = gate.length > 1 ? gate[i] : gate[0];
        
        // Detect trigger rising edge
        if (currentGateValue > 0.5 && this.lastGateValue <= 0.5) {
          // Send a trigger message
          this.port.postMessage({ type: 'trigger' });
        }
        // Detect falling edge
        else if (currentGateValue <= 0.5 && this.lastGateValue > 0.5) {
          // Send a release message
          this.port.postMessage({ type: 'release' });
        }
        
        this.lastGateValue = currentGateValue;
        outputChannel[i] = 0; // We don't need to output audio
      }
    }
    
    return true;
  }
}

registerProcessor('gate-detector-processor', GateDetectorProcessor);
