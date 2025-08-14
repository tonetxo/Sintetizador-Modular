// decoder.js
const audioContext = new AudioContext();

window.decoderAPI.onDecodeRequest((event, { audioData, moduleId }) => {
    console.log(`[Decoder] Received decode request for module ${moduleId}.`);
    // El dato recibido es un Uint8Array, necesitamos su ArrayBuffer subyacente.
    const arrayBuffer = audioData.buffer.slice(audioData.byteOffset, audioData.byteOffset + audioData.length);
    
    audioContext.decodeAudioData(arrayBuffer)
        .then(audioBuffer => {
            console.log(`[Decoder] Successfully decoded audio for module ${moduleId}.`);
            const transferableData = {
                sampleRate: audioBuffer.sampleRate,
                length: audioBuffer.length,
                numberOfChannels: audioBuffer.numberOfChannels,
                channelData: []
            };
            
            // --- CORRECCIÓN ---
            // Enviamos el ArrayBuffer subyacente de cada canal, que es mucho más eficiente
            // para la comunicación entre procesos (IPC) que un objeto Float32Array serializado.
            for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
                transferableData.channelData.push(audioBuffer.getChannelData(i).buffer);
            }
            
            console.log(`[Decoder] Sending decode result for module ${moduleId}.`);
            window.decoderAPI.sendDecodeResult({ success: true, moduleId, decodedData: transferableData });
        })
        .catch(error => {
            console.error(`[Decoder] Error decoding audio for module ${moduleId}:`, error);
            window.decoderAPI.sendDecodeResult({ success: false, moduleId, error: error.message });
        });
});

// Notificar al proceso principal que el decodificador está listo para trabajar.
// Esto es opcional pero una buena práctica.
if (window.decoderAPI && typeof window.decoderAPI.sendDecoderReady === 'function') {
    window.decoderAPI.sendDecoderReady();
    console.log('[Decoder] Decoder is ready.');
}