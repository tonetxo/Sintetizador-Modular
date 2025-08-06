/* global currentTime */
// worklets/arpeggiator-processor.js

class ArpeggiatorProcessor extends AudioWorkletProcessor {
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
        this._params = {
            tempo: 120,
            mode: 0, // 0: Up, 1: Down, 2: Up-Down, 3: Random
            octaveRange: 0, // 0: current, 1: +1 octave, 2: +2 octaves
            gateLength: 0.8,
            hold: false,
            running: false,
        };
        this._notes = []; // Array of MIDI notes currently held/latched
        this._currentStep = 0;
        this._nextStepTime = 0;
        this._gateOffEvents = [];
        this._isRunning = false;
        this._justStarted = false;
        this._pingPongDirection = 1; // For Up-Down mode
        this._clockInConnected = false; // Nuevo estado para la conexión del clock_in
        this._lastClockInValue = 0; // Para detectar flancos ascendentes

        this.port.onmessage = (e) => {
            if (e.data.type === 'config') {
                const wasRunning = this._isRunning;
                Object.assign(this._params, e.data.params);
                this._isRunning = this._params.running;
                this._clockInConnected = e.data.clockInConnected; // Actualizar estado de conexión

                if (this._isRunning && !wasRunning) {
                    this._justStarted = true;
                } else if (!this._isRunning && wasRunning) {
                    this._gateOffEvents = [];
                    this.port.postMessage({ type: 'step', midiNote: 0, gate: 'off' }); // Send a general off signal
                }
            } else if (e.data.type === 'notes') {
                this._notes = e.data.notes.sort((a, b) => a - b); // Keep notes sorted for arpeggiation
                if (this._notes.length === 0) {
                    this._currentStep = 0; // Reset step if no notes
                }
            }
        };
    }

    process(inputs, outputs, parameters) {
        if (this._justStarted) {
            this._currentStep = 0;
            this._nextStepTime = currentTime;
            this._gateOffEvents = [];
            this._justStarted = false;
        }

        if (!this._isRunning || this._notes.length === 0) {
            return true;
        }

        this._gateOffEvents = this._gateOffEvents.filter(event => {
            if (currentTime >= event.time) {
                this.port.postMessage({ type: 'step', midiNote: event.midiNote, gate: 'off' });
                return false;
            }
            return true;
        });

        const clockIn = parameters.clock_in;

        if (this._clockInConnected) {
            // Si clock_in está conectado, esperamos un flanco ascendente
            for (let i = 0; i < clockIn.length; i++) {
                const currentClockInValue = clockIn[i];
                if (currentClockInValue > 0.5 && this._lastClockInValue <= 0.5) { // Detectar flanco ascendente
                    this.triggerStepAndAdvance();
                }
                this._lastClockInValue = currentClockInValue;
            }
        } else {
            // Si no hay clock_in, usamos el tempo interno
            const stepDuration = (60 / this._params.tempo) / 4; // Assuming 16th notes for now
            if (currentTime >= this._nextStepTime) {
                this.triggerStepAndAdvance();
                this._nextStepTime += stepDuration;
            }
        }

        return true;
    }

    triggerStepAndAdvance() {
        const midiNote = this._getArpeggiatedNote();
        if (midiNote !== null) {
            this.port.postMessage({ type: 'step', midiNote: midiNote, gate: 'on' });

            const stepDuration = (60 / this._params.tempo) / 4; // Necesario para gateDuration
            const gateDuration = stepDuration * this._params.gateLength;
            this._gateOffEvents.push({
                time: currentTime + gateDuration,
                midiNote: midiNote
            });
        } else {
            // If no note is generated (e.g., no notes held and not in hold mode), send gate off
            this.port.postMessage({ type: 'step', midiNote: 0, gate: 'off' });
        }

        this._advanceStep();
    }

    _getArpeggiatedNote() {
        if (this._notes.length === 0) return null;

        let baseNote;
        let octaveOffset = 0;

        const totalNotesInArpeggio = this._notes.length * (this._params.octaveRange + 1);
        if (totalNotesInArpeggio === 0) return null;

        const effectiveStep = this._currentStep % totalNotesInArpeggio;

        switch (this._params.mode) {
            case 0: { // Up
                baseNote = this._notes[effectiveStep % this._notes.length];
                octaveOffset = Math.floor(effectiveStep / this._notes.length);
                break;
            }
            case 1: { // Down
                baseNote = this._notes[this._notes.length - 1 - (effectiveStep % this._notes.length)];
                octaveOffset = Math.floor(effectiveStep / this._notes.length);
                break;
            }
            case 2: { // Up-Down
                // Calculate total steps for one full up-down cycle
                const cycleLength = (this._notes.length * (this._params.octaveRange + 1)) * 2 - 2; // Up and then down, excluding start/end duplicates
                if (cycleLength <= 0) { // Handle single note or no octave range
                    baseNote = this._notes[0];
                    octaveOffset = 0;
                    break;
                }
                
                const currentCycleStep = this._currentStep % cycleLength;

                if (currentCycleStep < totalNotesInArpeggio) { // Up part
                    baseNote = this._notes[currentCycleStep % this._notes.length];
                    octaveOffset = Math.floor(currentCycleStep / this._notes.length);
                } else { // Down part
                    const downStep = cycleLength - currentCycleStep;
                    baseNote = this._notes[downStep % this._notes.length];
                    octaveOffset = Math.floor(downStep / this._notes.length);
                }
                break;
            }
            case 3: { // Random
                const randomIdx = Math.floor(Math.random() * this._notes.length);
                baseNote = this._notes[randomIdx];
                octaveOffset = Math.floor(Math.random() * (this._params.octaveRange + 1));
                break;
            }
            default: {
                baseNote = this._notes[0];
                octaveOffset = 0;
                break;
            }
        }

        return baseNote + (octaveOffset * 12);
    }

    _advanceStep() {
        const totalNotesInArpeggio = this._notes.length * (this._params.octaveRange + 1);
        if (totalNotesInArpeggio === 0) {
            this._currentStep = 0;
            return;
        }

        switch (this._params.mode) {
            case 0: // Up
            case 1: // Down
            case 3: // Random
                this._currentStep = (this._currentStep + 1);
                break;
            case 2: { // Up-Down
                const cycleLength = (this._notes.length * (this._params.octaveRange + 1)) * 2 - 2;
                if (cycleLength <= 0) {
                    this._currentStep = 0;
                } else {
                    this._currentStep = (this._currentStep + 1);
                }
                break;
            }
        }
    }
}

registerProcessor('arpeggiator-processor', ArpeggiatorProcessor);
