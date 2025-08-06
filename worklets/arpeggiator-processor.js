/* global currentTime */
// worklets/arpeggiator-processor.js

class ArpeggiatorProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [{ name: 'clock_in', defaultValue: 0, automationRate: 'a-rate' }];
    }
    constructor() {
        super();
        this._params = { tempo: 120, mode: 0, octaveRange: 0, gateLength: 0.8, hold: false, running: false };
        this._notes = [];
        this._currentStep = 0;
        this._nextStepTime = 0;
        this._gateOffEvents = [];
        this._isRunning = false;
        this._justStarted = false;
        this._clockInConnected = false;
        this._lastClockInValue = 0;

        this.port.onmessage = (e) => {
            if (e.data.type === 'config') {
                const wasRunning = this._isRunning;
                const wasClockConnected = this._clockInConnected;

                Object.assign(this._params, e.data.params);
                this._isRunning = this._params.running;
                this._clockInConnected = e.data.clockInConnected;

                if (this._isRunning && !wasRunning) {
                    this._justStarted = true;
                } else if (!this._isRunning && wasRunning) {
                    this._gateOffEvents = [];
                    this.port.postMessage({ type: 'step', midiNote: 0, gate: 'off' });
                }

                // Si se acaba de desconectar el reloj externo, reiniciar el reloj interno
                if (wasClockConnected && !this._clockInConnected) {
                    this._justStarted = true;
                }

            } else if (e.data.type === 'notes') {
                this._notes = e.data.notes.sort((a, b) => a - b);
                if (this._notes.length === 0) this._currentStep = 0;
            }
        };
    }

    process(inputs, outputs, parameters) {
        if (!this._isRunning || this._notes.length === 0) {
            return true;
        }

        // Manejar eventos de gate off
        this._gateOffEvents = this._gateOffEvents.filter(event => {
            if (currentTime >= event.time) {
                this.port.postMessage({ type: 'step', midiNote: event.midiNote, gate: 'off' });
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
        const midiNote = this._getArpeggiatedNote();
        if (midiNote !== null) {
            this.port.postMessage({ type: 'step', midiNote: midiNote, gate: 'on' });
            const stepDuration = (60 / this._params.tempo) / 4;
            const gateDuration = stepDuration * this._params.gateLength;
            this._gateOffEvents.push({ time: currentTime + gateDuration, midiNote });
        } else {
            this.port.postMessage({ type: 'step', midiNote: 0, gate: 'off' });
        }
        this._advanceStep();
    }

    _getArpeggiatedNote() {
        if (this._notes.length === 0) return null;
        
        const totalNotesInArpeggio = this._notes.length * (this._params.octaveRange + 1);
        if (totalNotesInArpeggio === 0) return null;

        const effectiveStep = this._currentStep % totalNotesInArpeggio;
        let baseNote;
        let octaveOffset = 0;
        
        switch (this._params.mode) {
            case 0: // Up
                baseNote = this._notes[effectiveStep % this._notes.length];
                octaveOffset = Math.floor(effectiveStep / this._notes.length);
                break;
            case 1: // Down
                baseNote = this._notes[this._notes.length - 1 - (effectiveStep % this._notes.length)];
                octaveOffset = Math.floor(effectiveStep / this._notes.length);
                break;
            case 2: { // Up-Down
                const cycleLength = totalNotesInArpeggio > 1 ? (totalNotesInArpeggio * 2) - 2 : 1;
                const currentCycleStep = this._currentStep % cycleLength;
                const stepIndex = currentCycleStep < totalNotesInArpeggio ? currentCycleStep : cycleLength - currentCycleStep;
                baseNote = this._notes[stepIndex % this._notes.length];
                octaveOffset = Math.floor(stepIndex / this._notes.length);
                break;
            }
            case 3: // Random
                baseNote = this._notes[Math.floor(Math.random() * this._notes.length)];
                octaveOffset = Math.floor(Math.random() * (this._params.octaveRange + 1));
                break;
        }
        return baseNote + (octaveOffset * 12);
    }

    _advanceStep() {
        this._currentStep++;
    }
}

registerProcessor('arpeggiator-processor', ArpeggiatorProcessor);