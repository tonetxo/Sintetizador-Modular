// src/worklets/processors/index.js

// Registrar todos los procesadores de audio
async function registerProcessors(context) {
    // --- CORRECCIÓN DEFINITIVA ---
    // La ruta base es relativa al `index.html` que está en `src/renderer/`.
    // Por tanto, la ruta correcta a la carpeta `src/worklets/` es `../worklets/`.
    const workletBasePath = '../worklets/'; 
    try {
        await Promise.all([
            context.audioWorklet.addModule(`${workletBasePath}vco-processor.js`),
            context.audioWorklet.addModule(`${workletBasePath}lfo-processor.js`),
            context.audioWorklet.addModule(`${workletBasePath}adsr-processor.js`),
            context.audioWorklet.addModule(`${workletBasePath}sample-and-hold-processor.js`),
            context.audioWorklet.addModule(`${workletBasePath}ring-mod-processor.js`),
            context.audioWorklet.addModule(`${workletBasePath}chorus-processor.js`),
            context.audioWorklet.addModule(`${workletBasePath}flanger-processor.js`),
            context.audioWorklet.addModule(`${workletBasePath}phaser-processor.js`),
            context.audioWorklet.addModule(`${workletBasePath}granular-processor.js`),
            context.audioWorklet.addModule(`${workletBasePath}sequencer-processor.js`),
            context.audioWorklet.addModule(`${workletBasePath}arpeggiator-processor.js`),
            context.audioWorklet.addModule(`${workletBasePath}clock-processor.js`),
            context.audioWorklet.addModule(`${workletBasePath}math-processor.js`),
            context.audioWorklet.addModule(`${workletBasePath}noise-generator-processor.js`),
            context.audioWorklet.addModule(`${workletBasePath}vocoder-processor.js`),
            context.audioWorklet.addModule(`${workletBasePath}gate-processor.js`),
            context.audioWorklet.addModule(`${workletBasePath}pwm-processor.js`),
            context.audioWorklet.addModule(`${workletBasePath}mic-processor.js`),
            context.audioWorklet.addModule(`${workletBasePath}cv-to-midi-processor.js`)
        ]);
    } catch (error) {
        console.error('Error critical registrando uno o más AudioWorklets:', error);
        throw error;
    }
}

export { registerProcessors };