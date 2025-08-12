// modules/Flanger.js
import { BaseEffect } from './BaseEffect.js';

export class Flanger extends BaseEffect {
    constructor(x, y, id = null, initialState = {}) {
        super(x, y, 'Flanger', 200, 220, id, initialState);
        this.processorName = 'flanger-processor';
        this.knobDefs = [
            { name: 'rate', label: 'Rate', min: 0.01, max: 5, initial: 0.5, logarithmic: true },
            { name: 'depth', label: 'Depth', min: 0.0005, max: 0.005, initial: 0.0025, logarithmic: true },
            { name: 'delay', label: 'Delay', min: 0.001, max: 0.02, initial: 0.005 },
            { name: 'feedback', label: 'Feedback', min: 0, max: 0.98, initial: 0.5 }
        ];
        this.readyPromise = this.init();
    }
}
