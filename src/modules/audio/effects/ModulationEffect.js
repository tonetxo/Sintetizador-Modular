// src/modules/audio/effects/ModulationEffect.js
// Clase base para efectos de modulación (Chorus, Flanger, Phaser)

export class ModulationEffect {
    constructor(audioContext, type, maxDelay = 0.02) {
        this.audioContext = audioContext;
        this.inputNode = this.audioContext.createGain();
        this.outputNode = this.audioContext.createGain();
        this.wetGain = this.audioContext.createGain();
        this.dryGain = this.audioContext.createGain();
        this.lfo = this.audioContext.createOscillator();
        this.lfoGain = this.audioContext.createGain();
        this.delayNodes = [];

        this.inputNode.connect(this.dryGain);
        this.dryGain.connect(this.outputNode);
        this.wetGain.connect(this.outputNode);

        this.lfo.connect(this.lfoGain);
        this.lfo.start();
    }

    createDelayLine(number = 1) {
        for (let i = 0; i < number; i++) {
            const delay = this.audioContext.createDelay(0.05);
            this.inputNode.connect(delay);
            delay.connect(this.wetGain);
            this.lfoGain.connect(delay.delayTime);
            this.delayNodes.push(delay);
        }
    }

    destroy() {
        this.lfo.stop();
        [
            this.inputNode, this.outputNode, this.wetGain,
            this.dryGain, this.lfo, this.lfoGain,
            ...this.delayNodes
        ].forEach(node => node.disconnect());
    }
}