self.onmessage = async (event) => {
    const { arrayBuffer } = event.data;

    if (!arrayBuffer) {
        self.postMessage({ success: false, error: 'No ArrayBuffer received.' });
        return;
    }

    try {
        // We need a new AudioContext for this thread.
        const audioContext = new OfflineAudioContext(1, 1, 44100);
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // Prepare data for transfer back to the main thread.
        // We can't transfer the AudioBuffer directly, but we can transfer its data.
        const transferableData = {
            sampleRate: audioBuffer.sampleRate,
            length: audioBuffer.length,
            numberOfChannels: audioBuffer.numberOfChannels,
            channelData: []
        };

        for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
            transferableData.channelData.push(audioBuffer.getChannelData(i).buffer);
        }

        self.postMessage({ success: true, decodedData: transferableData }, transferableData.channelData);
    } catch (error) {
        self.postMessage({ success: false, error: `Decoding failed: ${error.message}` });
    }
};