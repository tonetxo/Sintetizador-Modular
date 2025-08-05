const audioContext = new AudioContext();

window.decoderAPI.onDecodeRequest((event, { audioData, moduleId }) => {
    const arrayBuffer = audioData.buffer.slice(audioData.byteOffset, audioData.byteOffset + audioData.byteLength);

    audioContext.decodeAudioData(arrayBuffer)
        .then(audioBuffer => {
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
            window.decoderAPI.sendDecodeResult({ success: false, moduleId, error: error.message });
        });
});