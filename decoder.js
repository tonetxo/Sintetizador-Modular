const audioContext = new AudioContext();

window.decoderAPI.onDecodeRequest((event, { audioData, moduleId }) => {
    console.log(`[Decoder] Received decode request for module ${moduleId}. Data size: ${audioData.byteLength} bytes`);
    const arrayBuffer = audioData.buffer.slice(audioData.byteOffset, audioData.byteOffset + audioData.byteLength);

    audioContext.decodeAudioData(arrayBuffer)
        .then(audioBuffer => {
            console.log(`[Decoder] Successfully decoded audio for module ${moduleId}. Sample Rate: ${audioBuffer.sampleRate}, Length: ${audioBuffer.length}, Channels: ${audioBuffer.numberOfChannels}`);
            const transferableData = {
                sampleRate: audioBuffer.sampleRate,
                length: audioBuffer.length,
                numberOfChannels: audioBuffer.numberOfChannels,
                channelData: []
            };
            for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
                transferableData.channelData.push(audioBuffer.getChannelData(i));
            }
            window.decoderAPI.sendDecodeResult({ success: true, moduleId, decodedData: transferableData });
        })
        .catch(error => {
            console.error(`[Decoder] Error decoding audio for module ${moduleId}:`, error);
            window.decoderAPI.sendDecodeResult({ success: false, moduleId, error: error.message });
        });
});