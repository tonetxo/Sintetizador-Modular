// worklets/pwm-processor.js
/* global sampleRate */

class PwmProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: 'frequency',
        defaultValue: 440,   // << make sure default is inside range
        minValue: 20,
        maxValue: 20000,
        automationRate: 'a-rate'
      },
      {
        name: 'pulseWidth',
        defaultValue: 0.5,
        minValue: 0,
        maxValue: 1,
        automationRate: 'a-rate'
      }
    ];
  }

  constructor() {
    super();
    this.phase = 0;
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || !output[0]) return true;
    const channel = output[0];

    // Safely obtain the parameter arrays (they can be empty on first call)
    const freqArr = parameters.frequency  || [440];
    const pwArr   = parameters.pulseWidth || [0.5];

    // Helper to read either k-rate or a-rate value
    const getVal = (arr, idx, def) =>
      arr.length > idx ? arr[idx] : (arr.length === 1 ? arr[0] : def);

    for (let i = 0; i < channel.length; i++) {
      const freq = Math.max(20, Math.min(20000, getVal(freqArr, i, 440)));
      const pw   = Math.max(0,  Math.min(1,    getVal(pwArr,   i, 0.5)));

      const step = freq / sampleRate;
      this.phase = (this.phase + step) % 1;
      channel[i] = this.phase < pw ? 1 : -1;
    }
    return true;
  }
}

registerProcessor('pwm-processor', PwmProcessor);