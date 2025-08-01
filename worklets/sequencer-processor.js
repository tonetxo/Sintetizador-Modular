/* global currentTime, sampleRate */
// worklets/sequencer-processor.js
class SequencerProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'tempo', defaultValue: 120, minValue: 20, maxValue: 300 },
            { name: 'direction', defaultValue: 0, minValue: 0, maxValue: 3 },
            { name: 'steps', defaultValue: 16, minValue: 1, maxValue: 16 },
            { name: 'gateLevel', defaultValue: 1.0, minValue: 0.0, maxValue: 1.0 } // Nuevo AudioParam para gateLevel
        ];
    }

    constructor() {
        super();
        console.log('[SequencerProcessor] Constructor: Initializing.');
        this.phase = 0;
        this.currentStep = 0;
        this.pingPongDirection = 1;
        this.lastStepTime = -1;
        this.lastGateState = false;
        this._isRunning = false;
        this._initialized = false;
        this._debug = false; // Control debug logging

        this.sequence = Array(16).fill(0.5);
        this.gateLengths = Array(16).fill(0.5);
        this.stepStates = Array(16).fill(0);

        this.port.onmessage = (event) => {
            if (this._debug) console.log(`[SequencerProcessor] Message received: ${event.data.type}`);
            if (event.data.type === 'updateSequence') this.sequence = event.data.sequence;
            if (event.data.type === 'updateGateLengths') this.gateLengths = event.data.gateLengths;
            if (event.data.type === 'updateStepStates') this.stepData = event.data.stepStates;
            
            if (event.data.type === 'reset') {
                if (this._debug) console.log('[SequencerProcessor] Resetting state.');
                this.currentStep = 0;
                this.phase = 0;
                this.lastStepTime = -1;
            }
            
            if (event.data.type === 'start') {
                if (!this._isRunning) {
                    if (this._debug) console.log('[SequencerProcessor] Starting sequencer.');
                    this._isRunning = true;
                    // Initialize lastStepTime to current time for accurate first step timing
                    this.lastStepTime = currentTime; 
                    if (!this._initialized) {
                        this._initialized = true;
                    }
                }
            }
            
            if (event.data.type === 'stop') {
                console.log('[SequencerProcessor] Stopping sequencer.');
                this._isRunning = false;
                // Enviar mensaje de gateOff si estaba activo
                if (this.lastGateState) {
                    this.port.postMessage({ type: 'gateOff' });
                    this.lastGateState = false;
                }
            }
        };
    }

    process(inputs, outputs, parameters) {
        if (this._debug) console.log(`[SequencerProcessor] Process cycle. isRunning: ${this._isRunning}, currentTime: ${currentTime.toFixed(4)}`);
        if (!outputs[0]?.[0] || !outputs[1]?.[0]) return true;

        const cvOutput = outputs[0][0];
        const gateOutput = outputs[1][0];
        
        const tempo = parameters.tempo[0];
        const direction = parameters.direction[0];
        const numSteps = Math.round(parameters.steps[0]);
        const gateLevel = parameters.gateLevel[0]; // Obtener el valor de gateLevel

        const clockInput = inputs[0];
        const resetInput = inputs[1];

        const beatDuration = 60 / tempo;
        const stepDuration = beatDuration / 4;

        // Si no está corriendo, mantener el último valor CV y gate apagado
        if (!this._isRunning) {
            const lastCvValue = this.sequence[this.currentStep];
            for (let i = 0; i < cvOutput.length; i++) {
                cvOutput[i] = lastCvValue;
                gateOutput[i] = 0.0;
            }
            return true;
        }

        for (let i = 0; i < cvOutput.length; i++) {
            const time = currentTime + i / sampleRate;

            // Manejar reset
            if (resetInput?.[0]?.[i] > 0.5) {
                this.currentStep = 0;
                this.phase = 0;
                this.lastStepTime = time;
            }

            const isClockConnected = clockInput?.[0]?.[i] !== undefined;
            let shouldAdvance = false;

            if (isClockConnected) {
                if (clockInput[0][i] > 0.5 && (!this.lastClock || this.lastClock <= 0.5)) {
                    shouldAdvance = true;
                }
                this.lastClock = clockInput[0][i];
            } else { // No clock connected, use internal timing
                // Advance if current time has passed the expected time for the next step
                if (time >= this.lastStepTime + stepDuration) {
                    shouldAdvance = true;
                }
            }

            if (shouldAdvance) {
                this.advanceStep(direction, numSteps);
                this.lastStepTime = time;
                this.port.postMessage({ currentStep: this.currentStep });
                if (this._debug) console.log(`[SequencerProcessor] Advanced to step: ${this.currentStep}, lastStepTime: ${this.lastStepTime.toFixed(4)}`);
            }

            // Manejar gate
            let gateOn = false;
            const stepState = this.stepStates[this.currentStep];
            if (stepState === 0) {
                const gateDuration = stepDuration * this.gateLengths[this.currentStep];
                if (time - this.lastStepTime < gateDuration) {
                    gateOn = true;
                }
            }

            // Detección de cambios en el gate
            if (gateOn && !this.lastGateState) {
                this.port.postMessage({ type: 'gateOn' });
                if (this._debug) console.log(`[SequencerProcessor] Gate ON for step ${this.currentStep}. Time: ${time.toFixed(4)}`);
            } else if (!gateOn && this.lastGateState) {
                this.port.postMessage({ type: 'gateOff' });
                if (this._debug) console.log(`[SequencerProcessor] Gate OFF for step ${this.currentStep}. Time: ${time.toFixed(4)}`);
            }
            this.lastGateState = gateOn;

            // Escribir salidas
            cvOutput[i] = this.sequence[this.currentStep];
            gateOutput[i] = gateOn ? gateLevel : 0.0; // Usar gateLevel aquí
        }
        
        return true;
    }

    advanceStep(direction, numSteps) {
        let activeSteps = [];
        for(let i = 0; i < numSteps; i++) {
            if(this.stepStates[i] !== 2) {
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