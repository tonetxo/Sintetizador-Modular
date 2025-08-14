// src/modules/audio/effects/Chorus.js
import { BaseEffect } from '../../BaseEffect.js';

export class Chorus extends BaseEffect {
    constructor(audioContext, x, y, id = null, initialState = {}) {
        super(audioContext, x, y, 'Chorus', 200, 220, id, initialState);
        this.processorName = 'chorus-processor';
        this.knobDefs = [
            { name: 'rate', label: 'Rate', min: 0.1, max: 10, initial: 1.5 },
            { name: 'depth', label: 'Depth', min: 0.0005, max: 0.01, initial: 0.002, logarithmic: true },
            { name: 'delay', label: 'Delay', min: 0.01, max: 0.05, initial: 0.025 },
            { name: 'feedback', label: 'Feedback', min: 0, max: 0.95, initial: 0.2 }
        ];
        this.readyPromise = this.init();
    }
}