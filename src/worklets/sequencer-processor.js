/* global currentTime */
// worklets/sequencer-processor.js

class SequencerProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [{ name: 'clock_in', defaultValue: 0, automationRate: 'a-rate' }];
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
                const wasClockConnected = this._clockInConnected;

                this._params = e.data.params;
                this._isRunning = this._params.running;
                this._clockInConnected = e.data.clockInConnected;

                if (this._isRunning && !wasRunning) {
                    this._justStarted = true;
                } else if (!this._isRunning && wasRunning) {
                    this._gateOffEvents = [];
                    this.port.postMessage({ type: 'step', step: this._currentStep, gate: 'off' });
                }
                
                // Si se acaba de desconectar el reloj externo, reiniciar el reloj interno
                if (wasClockConnected && !this._clockInConnected) {
                    this._justStarted = true;
                }
            }
        };
    }

    process(inputs, outputs, parameters) {
        if (!this._isRunning) {
            return true;
        }

        // Manejar eventos de gate off
        this._gateOffEvents = this._gateOffEvents.filter(event => {
            if (currentTime >= event.time) {
                this.port.postMessage({ type: 'step', step: event.step, gate: 'off' });
                return false;
            }
            return true;
        });

        const clockIn = parameters.clock_in;

        if (this._clockInConnected) {
            // Modo de reloj externo: reaccionar a flancos ascendentes
            for (let i = 0; i < clockIn.length; i++) {
                if (clockIn[i] > 0.5 && this._lastClockInValue <= 0.5) { // Flanco ascendente detectado
                    this.triggerStepAndAdvance();
                }
                this._lastClockInValue = clockIn[i];
            }
        } else {
            // Modo de reloj interno: basado en el tempo
            if (this._justStarted) {
                this._nextStepTime = currentTime;
                this._justStarted = false;
            }

            const stepDuration = (60 / this._params.tempo) / 4; // 4 pasos por negra (semicorcheas)
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
        const gateDuration = stepDuration * (this._params.gateLengths[this._currentStep] || 0.8);
        this._gateOffEvents.push({ 
            time: currentTime + gateDuration, 
            step: this._currentStep 
        });
        this._advanceStep();
    }

    _advanceStep() {
        const steps = this._params.numberOfSteps;
        if (steps <= 0) return;
        const activeSteps = this._params.stepStates.slice(0, steps);
        if (activeSteps.every(state => state === 2)) return;

        let safetyCounter = 0;
        do {
            switch (this._params.direction) {
                case 0: this._currentStep = (this._currentStep + 1) % steps; break;
                case 1: this._currentStep = (this._currentStep - 1 + steps) % steps; break;
                case 2:
                    if (steps > 1) {
                        if (this._pingPongDirection === 1 && this._currentStep >= steps - 1) {
                            this._pingPongDirection = -1;
                            this._currentStep = Math.max(0, this._currentStep - 1);
                        } else if (this._pingPongDirection === -1 && this._currentStep <= 0) {
                            this._pingPongDirection = 1;
                            this._currentStep = Math.min(steps - 1, this._currentStep + 1);
                        } else {
                            this._currentStep += this._pingPongDirection;
                        }
                    } else {
                        this._currentStep = 0;
                    }
                    break;
                case 3: this._currentStep = Math.floor(Math.random() * steps); break;
            }
            this._currentStep = Math.max(0, Math.min(steps - 1, this._currentStep));
            safetyCounter++;
        } while (this._params.stepStates[this._currentStep] === 2 && safetyCounter < steps * 2);
    }
}

registerProcessor('sequencer-processor', SequencerProcessor);