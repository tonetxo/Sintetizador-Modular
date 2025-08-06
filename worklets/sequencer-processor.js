/* global currentTime */
// worklets/sequencer-processor.js

class SequencerProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            {
                name: 'clock_in',
                defaultValue: 0,
                minValue: 0,
                maxValue: 1,
                automationRate: 'a-rate'
            }
        ];
    }
    constructor() {
        super();
        this._params = {};
        this._currentStep = 0;
        this._nextStepTime = 0;
        this._gateOffEvents = [];
        this._pingPongDirection = 1;
        this._isRunning = false;
        this._justStarted = false;
        this._clockInConnected = false;
        this._lastClockInValue = 0;

        this.port.onmessage = (e) => {
            if (e.data.type === 'config') {
                const wasRunning = this._isRunning;
                this._params = e.data.params;
                this._isRunning = this._params.running;
                this._clockInConnected = e.data.clockInConnected;

                if (this._isRunning && !wasRunning) {
                    this._justStarted = true;
                } else if (!this._isRunning && wasRunning) {
                    this._gateOffEvents = [];
                    this.port.postMessage({ type: 'step', step: this._currentStep, gate: 'off' });
                }
            }
        };
    }

    process(inputs, outputs, parameters) {
        // --- INICIO DE LA CORRECCIÓN ---
        // Si no estamos en modo 'running' Y no hay un clock externo, no hacemos nada.
        if (!this._isRunning && !this._clockInConnected) {
            return true;
        }

        if (this._justStarted && !this._clockInConnected) {
            this._currentStep = 0;
            this._nextStepTime = currentTime;
            this._gateOffEvents = [];
            this._justStarted = false;
        }
        // --- FIN DE LA CORRECCIÓN ---

        this._gateOffEvents = this._gateOffEvents.filter(event => {
            if (currentTime >= event.time) {
                this.port.postMessage({ type: 'step', step: event.step, gate: 'off' });
                return false;
            }
            return true;
        });

        const clockIn = parameters.clock_in;

        if (this._clockInConnected) {
            for (let i = 0; i < clockIn.length; i++) {
                const currentClockInValue = clockIn[i];
                if (currentClockInValue > 0.5 && this._lastClockInValue <= 0.5) {
                    this.triggerStepAndAdvance();
                }
                this._lastClockInValue = currentClockInValue;
            }
        } else {
            // Este bloque solo se ejecuta si isRunning es true y no hay clock externo
            const stepDuration = (60 / this._params.tempo) / 4;
            if (currentTime >= this._nextStepTime) {
                this.triggerStepAndAdvance();
                this._nextStepTime += stepDuration;
            }
        }
        
        return true;
    }

    triggerStepAndAdvance() {
        this.port.postMessage({ type: 'step', step: this._currentStep, gate: 'on' });

        const stepDuration = (60 / this._params.tempo) / 4;
        const gateDuration = stepDuration * this._params.gateLengths[this._currentStep];
        this._gateOffEvents.push({ 
            time: currentTime + gateDuration, 
            step: this._currentStep 
        });
        
        this._advanceStep();
    }

    _advanceStep() {
        const steps = this._params.numberOfSteps;
        if (steps === 0) return;

        const activeSteps = this._params.stepStates.slice(0, steps);
        if (activeSteps.every(state => state === 2)) {
            return;
        }

        let safetyCounter = 0;
        do {
            switch (this._params.direction) {
                case 0: // FWD
                    this._currentStep = (this._currentStep + 1) % steps;
                    break;
                case 1: // BWD
                    this._currentStep = (this._currentStep - 1 + steps) % steps;
                    break;
                case 2: // P-P
                    if (steps <= 1) {
                        this._currentStep = 0;
                    } else if (this._pingPongDirection === 1 && this._currentStep >= steps - 1) {
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
            safetyCounter++;
        } while (this._params.stepStates[this._currentStep] === 2 && safetyCounter < steps * 2);
    }
}

registerProcessor('sequencer-processor', SequencerProcessor);