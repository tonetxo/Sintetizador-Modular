// worklets/sequencer-processor.js
class SequencerProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'tempo', defaultValue: 120, minValue: 20, maxValue: 300 },
            { name: 'direction', defaultValue: 0, minValue: 0, maxValue: 3 }, // 0: Fwd, 1: Bwd, 2: Ping-Pong, 3: Random
            { name: 'steps', defaultValue: 16, minValue: 1, maxValue: 16 },
            { name: 'running', defaultValue: 1, minValue: 0, maxValue: 1 } // 0: Stop, 1: Run
        ];
    }

    constructor() {
        super();
        this.phase = 0;
        this.currentStep = 0;
        this.pingPongDirection = 1; // 1 for forward, -1 for backward
        this.lastStepTime = -1; // -1 to indicate that the first step should trigger immediately
        this.lastGateState = false; // Track gate state for edge detection

        this.sequence = Array(16).fill(0.5); // CV values
        this.gateLengths = Array(16).fill(0.5); // Gate durations
        this.stepStates = Array(16).fill(0); // 0: On, 1: Off, 2: Skip

        this.port.onmessage = (event) => {
            if (event.data.type === 'updateSequence') { this.sequence = event.data.sequence; }
            if (event.data.type === 'updateGateLengths') { this.gateLengths = event.data.gateLengths; }
            if (event.data.type === 'updateStepStates') { this.stepStates = event.data.stepStates; }
            if (event.data.type === 'reset') {
                this.currentStep = 0;
                this.phase = 0;
                this.lastStepTime = -1;
            }
        };
    }

    process(inputs, outputs, parameters) {
        if (!outputs[0] || !outputs[0][0] || !outputs[1] || !outputs[1][0]) {
            return true;
        }

        const cvOutput = outputs[0][0];
        const gateOutput = outputs[1][0];
        
        const tempo = parameters.tempo[0];
        const direction = parameters.direction[0];
        const numSteps = Math.round(parameters.steps[0]);
        const isRunning = parameters.running[0] > 0.5;

        const clockInput = inputs[0];
        const resetInput = inputs[1];

        const clockTime = 60 / tempo;
        const stepTime = clockTime / 4;

        // If not running, ensure gate is off and CV is held, then return
        if (!isRunning) {
            if (this.lastGateState) {
                this.port.postMessage({ type: 'gateOff' });
                console.log(`[Worklet] Gate Off (Stopped)`);
                this.lastGateState = false;
            }
            // Hold the last CV value
            const lastCvValue = this.sequence[this.currentStep];
            for (let i = 0; i < cvOutput.length; i++) {
                cvOutput[i] = lastCvValue;
                gateOutput[i] = 0.0;
            }
            return true;
        }

        for (let i = 0; i < cvOutput.length; i++) {
            const time = currentTime + i / sampleRate;

            if (resetInput && resetInput.length > 0 && resetInput[0][i] > 0.5) {
                this.currentStep = 0;
                this.phase = 0;
                this.lastStepTime = time;
            }

            const isClockConnected = clockInput && clockInput.length > 0 && clockInput[0].length > 0;
            let shouldAdvance = false;

            if (isClockConnected) {
                if (clockInput[0][i] > 0.5 && (!this.lastClock || this.lastClock <= 0.5)) {
                    shouldAdvance = true;
                }
                this.lastClock = clockInput[0][i];
            } else {
                if (this.lastStepTime < 0) { // Initial step
                    shouldAdvance = true;
                } else {
                    this.phase += 1 / sampleRate;
                    if (this.phase >= stepTime) {
                        this.phase -= stepTime;
                        shouldAdvance = true;
                    }
                }
            }

            if (shouldAdvance) {
                this.advanceStep(direction, numSteps);
                this.lastStepTime = time;
                this.port.postMessage({ currentStep: this.currentStep });
                console.log(`[Worklet] Advanced to step: ${this.currentStep}, CV: ${this.sequence[this.currentStep].toFixed(2)}`);
            }

            let gateOn = false;
            const stepState = this.stepStates[this.currentStep];
            if (stepState === 0) { // Step is ON
                const gateDuration = stepTime * this.gateLengths[this.currentStep];
                if (time - this.lastStepTime < gateDuration) {
                    gateOn = true;
                }
            }

            // Edge detection for gate messages
            if (gateOn && !this.lastGateState) {
                this.port.postMessage({ type: 'gateOn' });
                console.log(`[Worklet] Gate On`);
            } else if (!gateOn && this.lastGateState) {
                this.port.postMessage({ type: 'gateOff' });
                console.log(`[Worklet] Gate Off`);
            }
            this.lastGateState = gateOn;

            cvOutput[i] = this.sequence[this.currentStep];
            gateOutput[i] = gateOn ? 1.0 : 0.0;
        }
        
        return true;
    }

    advanceStep(direction, numSteps) {
        let activeSteps = [];
        for(let i=0; i<numSteps; i++) {
            if(this.stepStates[i] !== 2) { // Not skipped
                activeSteps.push(i);
            }
        }
        if(activeSteps.length === 0) return;

        let currentActiveIndex = activeSteps.indexOf(this.currentStep);
        if(currentActiveIndex === -1) currentActiveIndex = 0;

        switch (direction) {
            case 0: // Forward
                currentActiveIndex = (currentActiveIndex + 1) % activeSteps.length;
                break;
            case 1: // Backward
                currentActiveIndex = (currentActiveIndex - 1 + activeSteps.length) % activeSteps.length;
                break;
            case 2: // Ping-Pong
                if (currentActiveIndex >= activeSteps.length - 1) this.pingPongDirection = -1;
                if (currentActiveIndex <= 0) this.pingPongDirection = 1;
                currentActiveIndex += this.pingPongDirection;
                break;
            case 3: // Random
                currentActiveIndex = Math.floor(Math.random() * activeSteps.length);
                break;
        }
        this.currentStep = activeSteps[currentActiveIndex];
    }
}

registerProcessor('sequencer-processor', SequencerProcessor);
