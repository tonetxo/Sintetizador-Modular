// SampleAndHold.js
export class SampleAndHold {
  constructor(inputNode, clockNode, audioContext) {
    this.inputNode = inputNode;
    this.clockNode = clockNode;
    this.audioContext = audioContext;

    this.heldValue = audioContext.createConstantSource();
    this.heldValue.offset.value = 0;
    this.heldValue.start();

    this.clockAnalyser = audioContext.createAnalyser();
    this.clockAnalyser.fftSize = 32;
    this.clockBuffer = new Uint8Array(this.clockAnalyser.frequencyBinCount);

    this.inputAnalyser = audioContext.createAnalyser();
    this.inputAnalyser.fftSize = 32;
    this.inputBuffer = new Float32Array(this.inputAnalyser.fftSize);

    this.clockNode.connect(this.clockAnalyser);
    this.inputNode.connect(this.inputAnalyser);

    this.lastClockHigh = false;
  }

  update() {
    this.clockAnalyser.getByteTimeDomainData(this.clockBuffer);
    const clockValue = this.clockBuffer[0];
    const currentClockHigh = clockValue > 128;

    if (currentClockHigh && !this.lastClockHigh) {
      this.inputAnalyser.getFloatTimeDomainData(this.inputBuffer);
      const sampledValue = this.inputBuffer[0] || 0;
      this.heldValue.offset.setValueAtTime(sampledValue, this.audioContext.currentTime);
    }

    this.lastClockHigh = currentClockHigh;
  }

  get output() {
    return this.heldValue;
  }
}
