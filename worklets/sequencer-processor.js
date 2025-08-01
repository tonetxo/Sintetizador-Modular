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
        this._sequence = Array(16).fill(0.5);
        this._gateLengths = Array(16).fill(0.5);
        this._stepStates = Array(16).fill(0); // 0: ON, 1: OFF, 2: SKIP
        this._nextStepTime = 0;
        this._gateEndTime = -1;
        this._lastCv = 0;
        this._justStarted = false; // Flag to handle first run
        this._lastGateState = 0; // Track gate state for messages

        console.log(`[SequencerProcessor] Constructor: Initializing.`);

        this.port.onmessage = (e) => {
            if (e.data.type === 'start') {
                if (!this._isRunning) {
                    console.log(`[SequencerProcessor] Received start message.`);
                    this._isRunning = true;
                    this._justStarted = true; // Signal to the process loop to set the start time
                }
            } else if (e.data.type === 'stop') {
                if (this._isRunning) {
                    console.log(`[SequencerProcessor] Received stop message.`);
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
            return true; // Not ready yet
        }

        // On the first run after starting, set the time reference from the audio thread.
        if (this._justStarted) {
            this._nextStepTime = currentTime;
            this._justStarted = false;
            console.log(`[SequencerProcessor] First run detected. Initializing nextStepTime to ${this._nextStepTime.toFixed(4)}`);
        }

        const tempo = parameters.tempo[0];
        const steps = Math.round(parameters.steps[0]);
        const stepDuration = (60 / tempo) / 4; // Dividido por 4 para semicorcheas (16th notes)

        for (let i = 0; i < bufferSize; i++) {
            const time = currentTime + i / sampleRate;

            while (this._isRunning && time >= this._nextStepTime) {
                const stepState = this._stepStates[this._currentStep];

                if (stepState === 0) { // Step is ON
                    const cv = this._sequence[this._currentStep];
                    const gateLength = this._gateLengths[this._currentStep];
                    this._lastCv = cv;
                    this._gateEndTime = this._nextStepTime + stepDuration * gateLength;
                }

                this.port.postMessage({ currentStep: this._currentStep });
                this._currentStep = (this._currentStep + 1) % steps;
                this._nextStepTime += stepDuration;
            }

            if (gateOutput && gateOutput[0]) {
                const currentGate = time < this._gateEndTime ? 1 : 0;
                gateOutput[0][i] = currentGate;

                if (currentGate !== this._lastGateState) {
                    this.port.postMessage({ type: currentGate === 1 ? 'gateOn' : 'gateOff' });
                    this._lastGateState = currentGate;
                }
            }
            if (cvOutput && cvOutput[0]) {
                cvOutput[0][i] = this._lastCv;
            }
        }

        return true;
    }
}

registerProcessor('sequencer-processor', SequencerProcessor);