/* global currentTime */
// worklets/arpeggiator-processor.js

class ArpeggiatorProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [{ name: 'clock_in', defaultValue: 0, automationRate: 'a-rate' }];
    }
    constructor() {
        super();
        this._params = { tempo: 120, mode: 'up', octaves: 1, gateLength: 0.8, running: false };
        this._notes = [];
        this._sortedNotes = [];
        this._currentStep = 0;
        this._nextStepTime = 0;
        this._gateOffEvent = null;
        this._isRunning = false;
        this._justStarted = false;
        this._clockInConnected = false;
        this._lastClockInValue = 0;

        this.port.onmessage = (e) => {
            if (e.data.type === 'config') {
                const wasRunning = this._isRunning;
                Object.assign(this._params, e.data.params);
                this._clockInConnected = e.data.clockInConnected;
                this._isRunning = this._params.running;
                if (this._isRunning && !wasRunning) {
                    this._justStarted = true;
                    this._currentStep = 0;
                }
            } else if (e.data.type === 'notes') {
                this._notes = e.data.notes;
                this._sortedNotes = [...this._notes].sort((a, b) => a - b);
                if (this._notes.length === 0 && !this._params.hold) {
                    this._currentStep = 0;
                }
            }
        };
    }

    process(inputs, outputs, parameters) {
        if (!this._isRunning || this._sortedNotes.length === 0) {
            if(this._gateOffEvent) {
                this.port.postMessage({ type: 'step', midiNote: this._gateOffEvent.midiNote, gate: 'off' });
                this._gateOffEvent = null;
            }
            return true;
        }

        if (this._gateOffEvent && currentTime >= this._gateOffEvent.time) {
            this.port.postMessage({ type: 'step', midiNote: this._gateOffEvent.midiNote, gate: 'off' });
            this._gateOffEvent = null;
        }

        const clockIn = parameters.clock_in;
        let trigger = false;

        if (this._clockInConnected) {
            for (let i = 0; i < clockIn.length; i++) {
                const currentClockValue = clockIn.length > 1 ? clockIn[i] : clockIn[0];
                if (currentClockValue > 0.5 && this._lastClockInValue <= 0.5) {
                    trigger = true;
                    this._lastClockInValue = currentClockValue;
                    break; 
                }
                this._lastClockInValue = currentClockValue;
            }
        } else {
            if (this._justStarted) {
                this._nextStepTime = currentTime;
                this._justStarted = false;
            }
            const stepDuration = (60 / this._params.tempo) / 4; // 16th notes
            if (currentTime >= this._nextStepTime) {
                trigger = true;
                this._nextStepTime += stepDuration;
            }
        }

        if (trigger) {
            this.triggerStepAndAdvance();
        }

        return true;
    }

    triggerStepAndAdvance() {
        const midiNote = this._getArpeggiatedNote();
        
        if (midiNote !== null && isFinite(midiNote)) {
            if(this._gateOffEvent) {
                this.port.postMessage({ type: 'step', midiNote: this._gateOffEvent.midiNote, gate: 'off' });
            }
            this.port.postMessage({ type: 'step', midiNote: midiNote, gate: 'on' });
            const stepDuration = (60 / this._params.tempo) / 4;
            const gateDuration = stepDuration * this._params.gateLength;
            this._gateOffEvent = { time: currentTime + gateDuration, midiNote };
        }
        this._advanceStep();
    }

    _getArpeggiatedNote() {
        if (this._sortedNotes.length === 0) return null;
        
        let noteIndex, octaveOffset, baseNote;
        const numNotes = this._sortedNotes.length;
        const octaves = this._params.octaves || 1;
        const totalOctaveNotes = numNotes * octaves;
        if (totalOctaveNotes === 0) return null;

        switch (this._params.mode) {
            case 'up':
            case 'down':
                this._currentStep = this._currentStep % totalOctaveNotes;
                noteIndex = this._currentStep % numNotes;
                octaveOffset = Math.floor(this._currentStep / numNotes);
                baseNote = (this._params.mode === 'down')
                    ? this._sortedNotes[numNotes - 1 - noteIndex]
                    : this._sortedNotes[noteIndex];
                break;

            case 'up-down': {
                const maxStep = totalOctaveNotes > 1 ? (totalOctaveNotes * 2) - 2 : 1;
                const step = this._currentStep % maxStep;
                const idx = step < totalOctaveNotes ? step : maxStep - step;
                
                noteIndex = idx % numNotes;
                octaveOffset = Math.floor(idx / numNotes);
                baseNote = this._sortedNotes[noteIndex];
                break;
            }

            case 'random':
                noteIndex = Math.floor(Math.random() * numNotes);
                octaveOffset = Math.floor(Math.random() * octaves);
                baseNote = this._sortedNotes[noteIndex];
                break;
            
            default:
                return null;
        }

        if (typeof baseNote !== 'number') return null;
        
        const finalNote = baseNote + (octaveOffset * 12);
        return isFinite(finalNote) ? finalNote : null;
    }

    _advanceStep() {
        this._currentStep++;
    }
}

registerProcessor('arpeggiator-processor', ArpeggiatorProcessor);