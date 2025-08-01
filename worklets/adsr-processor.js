/* global sampleRate */
// worklets/adsr-processor.js

const STATE = {
  IDLE: 0,
  ATTACK: 1,
  DECAY: 2,
  SUSTAIN: 3,
  RELEASE: 4,
};

class AdsrProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'attack', defaultValue: 0.01, minValue: 0.001, maxValue: 2 },
      { name: 'decay', defaultValue: 0.1, minValue: 0.001, maxValue: 2 },
      { name: 'sustain', defaultValue: 0.8, minValue: 0, maxValue: 1 },
      { name: 'release', defaultValue: 0.2, minValue: 0.001, maxValue: 5 },
    ];
  }

  constructor() {
    super();
    this._state = STATE.IDLE;
    this._currentValue = 0.0;
    this._lastGate = 0;
  }

  process(inputs, outputs, parameters) {
    const gateInput = inputs[0];
    const output = outputs[0];
    const outputChannel = output[0];

    // Asegurarse de que los parámetros no son cero para evitar división por cero
    const attackDuration = Math.max(0.001, parameters.attack[0]);
    const decayDuration = Math.max(0.001, parameters.decay[0]);
    const sustainLevel = parameters.sustain[0];
    const releaseDuration = Math.max(0.001, parameters.release[0]);

    for (let i = 0; i < outputChannel.length; i++) {
      const gate = gateInput[0] ? gateInput[0][i] : 0;

      // Detección de flanco de subida (inicio de nota)
      if (gate > 0.5 && this._lastGate <= 0.5) {
        this._state = STATE.ATTACK;
      }

      // Detección de flanco de bajada (fin de nota)
      if (gate <= 0.5 && this._lastGate > 0.5) {
        this._state = STATE.RELEASE;
      }

      this._lastGate = gate;

      switch (this._state) {
        case STATE.IDLE:
          this._currentValue = 0;
          break;

        case STATE.ATTACK:
          this._currentValue += (1.0 / (attackDuration * sampleRate));
          if (this._currentValue >= 1.0) {
            this._currentValue = 1.0;
            this._state = STATE.DECAY;
          }
          break;

        case STATE.DECAY:
          if (this._currentValue > sustainLevel) {
              this._currentValue -= ((1.0 - sustainLevel) / (decayDuration * sampleRate));
          } else {
              this._currentValue = sustainLevel;
              this._state = STATE.SUSTAIN;
          }
          break;

        case STATE.SUSTAIN:
          this._currentValue = sustainLevel;
          break;

        case STATE.RELEASE:
          this._currentValue -= (this._currentValue / (releaseDuration * sampleRate));
          if (this._currentValue <= 0.0001) {
            this._currentValue = 0;
            this._state = STATE.IDLE;
          }
          break;
      }
      outputChannel[i] = this._currentValue;
    }

    return true;
  }
}

registerProcessor('adsr-processor', AdsrProcessor);
