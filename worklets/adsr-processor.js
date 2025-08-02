/* global currentTime, sampleRate */
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
      { name: 'release', defaultValue: 0.5, minValue: 0.001, maxValue: 5 },
    ];
  }

  constructor() {
    super();
    this._state = STATE.IDLE;
    this._currentValue = 0.0;
    this._lastGate = 0;
    this._releaseDecrement = 0.0;
    this._phase = 0; // Phase for envelope segments
    this._peakValue = 0; // Value at the end of attack, start of decay
  }

  process(inputs, outputs, parameters) {
    // Guarda de seguridad: no procesar si las salidas no están listas.
    const output = outputs[0];
    if (!output || !output[0]) {
      return true;
    }

    const gateInput = inputs[0];
    const outputChannel = output[0];
    const bufferSize = outputChannel.length;

    // Obtener parámetros una vez por bloque
    const attackDuration = Math.max(0.001, parameters.attack[0]);
    const decayDuration = Math.max(0.001, parameters.decay[0]);
    const sustainLevel = parameters.sustain[0];
    const releaseDuration = Math.max(0.001, parameters.release[0]);

    for (let i = 0; i < bufferSize; i++) {
      // Usar la entrada de gate si está conectada, si no, asumir 0.
      const gate = gateInput && gateInput[0] ? gateInput[0][i] : 0;

      // Lógica de disparo (Schmitt Trigger)
      if (gate > 0.5 && this._lastGate <= 0.5) { // Flanco de subida
        this._state = STATE.ATTACK;
        this._phase = 0; // Reset phase for new attack
      } else if (gate <= 0.5 && this._lastGate > 0.5) { // Flanco de bajada
        if (this._state !== STATE.IDLE) {
          this._state = STATE.RELEASE;
          this._phase = 0; // Reset phase for new release
          this._releaseStartValue = this._currentValue; // Store value at start of release
        }
      }
      this._lastGate = gate;

      // Máquina de estados de la envolvente
      switch (this._state) {
        case STATE.IDLE:
          this._currentValue = 0;
          break;

        case STATE.ATTACK:
          this._phase += 1 / (attackDuration * sampleRate);
          if (this._phase >= 1) {
            this._currentValue = 1.0;
            this._state = STATE.DECAY;
            this._phase = 0; // Reset phase for decay
            this._peakValue = 1.0; // Value at the end of attack
          } else {
            // Exponential attack curve
            this._currentValue = 1 - Math.exp(-5 * this._phase); // Adjust 5 for steeper curve
          }
          break;

        case STATE.DECAY:
          this._phase += 1 / (decayDuration * sampleRate);
          if (this._phase >= 1) {
            this._currentValue = sustainLevel;
            this._state = STATE.SUSTAIN;
          } else {
            // Exponential decay curve from peak to sustain
            this._currentValue = sustainLevel + (this._peakValue - sustainLevel) * Math.exp(-5 * this._phase); // Adjust 5 for steeper curve
          }
          break;

        case STATE.SUSTAIN:
          this._currentValue = sustainLevel;
          break;

        case STATE.RELEASE:
          this._phase += 1 / (releaseDuration * sampleRate);
          if (this._phase >= 1) {
            this._currentValue = 0;
            this._state = STATE.IDLE;
          } else {
            // Exponential release curve from current value to 0
            this._currentValue = this._releaseStartValue * Math.exp(-5 * this._phase); // Adjust 5 for steeper curve
          }
          break;
      }
      outputChannel[i] = this._currentValue;
    }
    return true;
  }
}

registerProcessor('adsr-processor', AdsrProcessor);