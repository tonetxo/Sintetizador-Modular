/* global currentTime, sampleRate */
// worklets/sequencer-processor.js
class SequencerProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'tempo', defaultValue: 120, minValue: 20, maxValue: 300 },
            { name: 'direction', defaultValue: 0, minValue: 0, maxValue: 3 },
            { name: 'steps', defaultValue: 16, minValue: 1, maxValue: 16 },
        ];
    }

    constructor() {
        super();
        this._isRunning = false;
        this._currentStep = 0;
        this._pingPongDirection = 1; // 1 for fwd, -1 for bwd
        this._sequence = Array(16).fill(0.5);
        this._gateLengths = Array(16).fill(0.5);
        this._stepStates = Array(16).fill(0); // 0: ON, 1: OFF, 2: SKIP
        this._nextStepTime = 0;
        this._gateEndTime = -1;
        this._lastCv = 0; // El valor de CV objetivo
        this._smoothedCv = 0; // El valor de CV suavizado (salida real)
        this._justStarted = false;

        this.port.onmessage = (e) => {
            if (e.data.type === 'start') {
                if (!this._isRunning) {
                    this._isRunning = true;
                    this._justStarted = true;
                }
            } else if (e.data.type === 'stop') {
                if (this._isRunning) {
                    this._isRunning = false;
                    this._justStarted = false;
                    this._currentStep = 0;
                    this._gateEndTime = -1;
                    this.port.postMessage({ currentStep: this._currentStep });
                }
            } else if (e.data.type === 'updateSequence') {
                this._sequence = e.data.sequence;
            } else if (e.data.type === 'updateGateLengths') {
                this._gateLengths = e.data.gateLengths;
            } else if (e.data.type === 'updateStepStates') {
                this._stepStates = e.data.stepStates;
            }
        };
    }

    process(inputs, outputs, parameters) {
        const cvOutput = outputs[0];
        const gateOutput = outputs[1];
        const bufferSize = cvOutput?.[0]?.length;

        if (!bufferSize) {
            return true;
        }

        if (this._isRunning) {
            if (this._justStarted) {
                this._nextStepTime = currentTime;
                this._justStarted = false;
                this._smoothedCv = this._sequence[this._currentStep];
            }

            const tempo = parameters.tempo[0];
            const steps = Math.round(parameters.steps[0]);
            const direction = parameters.direction[0];
            const stepDuration = (60 / tempo) / 4; // 16th notes
            // Slew más agresivo para un glide más notable (~25Hz)
            const slewFactor = 1 - Math.exp(-2 * Math.PI * 25 / sampleRate);

            for (let i = 0; i < bufferSize; i++) {
                const time = currentTime + i / sampleRate;

                while (time >= this._nextStepTime) {
                    if (this._currentStep >= steps) {
                        this._currentStep = 0;
                    }

                    const stepState = this._stepStates[this._currentStep];

                    if (stepState !== 1) { // ON or SKIP
                        this._lastCv = this._sequence[this._currentStep];
                    }
                    
                    if (stepState === 0) { // ON
                        const gateLength = this._gateLengths[this._currentStep];
                        const minGateDuration = 0.001;
                        const gateDuration = stepDuration * gateLength;
                        this._gateEndTime = this._nextStepTime + Math.max(gateDuration, minGateDuration);
                    }

                    this.port.postMessage({ currentStep: this._currentStep });
                    this._advanceStep(steps, direction);
                    this._nextStepTime += stepDuration;
                }

                const currentGate = time < this._gateEndTime ? 1 : 0;
                
                this._smoothedCv += (this._lastCv - this._smoothedCv) * slewFactor;

                if (gateOutput && gateOutput[0]) {
                    gateOutput[0][i] = currentGate;
                }
                if (cvOutput && cvOutput[0]) {
                    cvOutput[0][i] = this._smoothedCv;
                }
            }
        } else {
            for (let i = 0; i < bufferSize; i++) {
                if (gateOutput && gateOutput[0]) {
                    gateOutput[0][i] = 0;
                }
                if (cvOutput && cvOutput[0]) {
                    cvOutput[0][i] = this._smoothedCv;
                }
            }
        }

        return true;
    }

    _advanceStep(steps, direction) {
        const currentStep = this._currentStep;
        const currentDirection = Math.round(direction);

        switch (currentDirection) {
            case 0: // FWD (Forward)
                this._currentStep = (currentStep + 1) % steps;
                break;
            case 1: // BWD (Backward)
                this._currentStep = (currentStep - 1 + steps) % steps;
                break;
            case 2: // P-P (Ping-Pong)
                if (steps <= 1) {
                    this._currentStep = 0;
                    return;
                }
                if (this._pingPongDirection === 1 && currentStep >= steps - 1) {
                    this._pingPongDirection = -1;
                    this._currentStep = steps - 2;
                } else if (this._pingPongDirection === -1 && currentStep <= 0) {
                    this._pingPongDirection = 1;
                    this._currentStep = 1;
                } else {
                    this._currentStep += this._pingPongDirection;
                }
                // Clamp to be safe
                this._currentStep = Math.max(0, Math.min(steps - 1, this._currentStep));
                break;
            case 3: // RND (Random)
                this._currentStep = Math.floor(Math.random() * steps);
                break;
            default:
                this._currentStep = (currentStep + 1) % steps;
        }
    }
}

registerProcessor('sequencer-processor', SequencerProcessor);