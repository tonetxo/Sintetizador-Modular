/* global currentTime */
// worklets/cv-to-midi-processor.js

class CvToMidiProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this._lastGateValue = 0;
        this._activeNotes = new Set(); // Set of MIDI notes currently active
    }

    static get parameterDescriptors() {
        return [
            {
                name: 'cvIn',
                defaultValue: 0,
                minValue: -5,
                maxValue: 5,
                automationRate: 'a-rate'
            },
            {
                name: 'gateIn',
                defaultValue: 0,
                minValue: 0,
                maxValue: 1,
                automationRate: 'a-rate'
            }
        ];
    }

    process(inputs, outputs, parameters) {
        const cvIn = parameters.cvIn;
        const gateIn = parameters.gateIn;

        // El bloque de procesamiento tiene 128 frames
        const blockSize = cvIn.length; 
        if (blockSize === 0) {
            return true;
        }

        for (let i = 0; i < blockSize; i++) {
            const currentGateValue = gateIn.length > 1 ? gateIn[i] : gateIn[0];
            const currentCvValue = cvIn.length > 1 ? cvIn[i] : cvIn[0];

            // Rising edge detection (gate goes from low to high)
            if (currentGateValue > 0.5 && this._lastGateValue <= 0.5) {
                // Gate ON
                const midiNote = Math.round((currentCvValue * 12) + 60); // 1V/Octave, C4=0V (MIDI 60)
                this._activeNotes.add(midiNote);
                this.port.postMessage({ type: 'noteOn', midiNote: midiNote });
            }
            // Falling edge detection (gate goes from high to low)
            else if (currentGateValue <= 0.5 && this._lastGateValue > 0.5) {
                // Gate OFF
                // Para el noteOff, es más fiable apagar la última nota que se encendió,
                // ya que el CV puede haber cambiado.
                const notesArray = Array.from(this._activeNotes).sort((a,b) => a-b);
                if (notesArray.length > 0) {
                    const noteToRemove = notesArray[notesArray.length - 1]; // LIFO behavior
                    this._activeNotes.delete(noteToRemove);
                    this.port.postMessage({ type: 'noteOff', midiNote: noteToRemove });
                }
            }

            this._lastGateValue = currentGateValue;
        }

        return true;
    }
}

registerProcessor('cv-to-midi-processor', CvToMidiProcessor);