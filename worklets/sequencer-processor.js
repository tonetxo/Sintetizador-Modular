/* global currentTime */
// worklets/sequencer-processor.js

class SequencerProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this._params = {};
        this._currentStep = 0;
        this._nextStepTime = 0;
        this._gateOffEvents = [];
        this._pingPongDirection = 1;
        this._isRunning = false;
        this._justStarted = false;

        this.port.onmessage = (e) => {
            if (e.data.type === 'config') {
                const wasRunning = this._isRunning;
                this._params = e.data.params;
                this._isRunning = this._params.running;

                if (this._isRunning && !wasRunning) {
                    this._justStarted = true;
                } else if (!this._isRunning && wasRunning) {
                    this._gateOffEvents = [];
                    this.port.postMessage({ type: 'step', step: this._currentStep, gate: 'off' });
                }
            }
        };
    }

    process() {
        if (this._justStarted) {
            this._currentStep = 0;
            this._nextStepTime = currentTime;
            this._gateOffEvents = [];
            this._justStarted = false;
        }

        if (!this._isRunning) {
            return true;
        }

        this._gateOffEvents = this._gateOffEvents.filter(event => {
            if (currentTime >= event.time) {
                this.port.postMessage({ type: 'step', step: event.step, gate: 'off' });
                return false;
            }
            return true;
        });

        const stepDuration = (60 / this._params.tempo) / 4;
        
        if (currentTime >= this._nextStepTime) {
            this.port.postMessage({ type: 'step', step: this._currentStep, gate: 'on' });

            const gateDuration = stepDuration * this._params.gateLengths[this._currentStep];
            this._gateOffEvents.push({ 
                time: this._nextStepTime + gateDuration, 
                step: this._currentStep 
            });
            
            this._advanceStep();
            this._nextStepTime += stepDuration;
        }
        
        return true;
    }

    _advanceStep() {
        const steps = this._params.numberOfSteps;
        const direction = this._params.direction;

        switch (direction) {
            case 0: // FWD
                this._currentStep = (this._currentStep + 1) % steps;
                break;
            case 1: // BWD
                this._currentStep = (this._currentStep - 1 + steps) % steps;
                break;
            case 2: // P-P
                if (steps <= 1) { this._currentStep = 0; return; }
                if (this._pingPongDirection === 1 && this._currentStep >= steps - 1) {
                    this._pingPongDirection = -1;
                    this._currentStep = Math.max(0, steps - 2);
                } else if (this._pingPongDirection === -1 && this._currentStep <= 0) {
                    this._pingPongDirection = 1;
                    this._currentStep = Math.min(1, steps - 1);
                } else {
                    this._currentStep += this._pingPongDirection;
                }
                break;
            case 3: // RND
                this._currentStep = Math.floor(Math.random() * steps);
                break;
        }
    }
}

registerProcessor('sequencer-processor', SequencerProcessor);