import { audioContext } from './AudioContext.js';

export class AudioPlayer {
    constructor(x, y, id = null) {
        this.id = id || `audioplayer-${Date.now()}`;
        this.x = x;
        this.y = y;
        this.width = 200;
        this.height = 100;
        this.type = 'AudioPlayer';

        this.audioBuffer = null;
        this.source = null;
        this.output = audioContext.createGain();
        this.isPlaying = false;
        this.loop = true;

        this.outputs = {
            'audio': { x: this.width, y: this.height / 2, type: 'audio', source: this.output, orientation: 'horizontal' }
        };
        this.inputs = {};
    }

    loadDecodedData(decodedData) {
        try {
            const newBuffer = audioContext.createBuffer(
                decodedData.numberOfChannels,
                decodedData.length,
                decodedData.sampleRate
            );

            for (let i = 0; i < decodedData.numberOfChannels; i++) {
                newBuffer.copyToChannel(new Float32Array(decodedData.channelData[i]), i);
            }

            this.audioBuffer = newBuffer;

            // Reset playback state and update UI after new audio is loaded
            this.isPlaying = false; // Ensure it's not playing initially
            if (this.onPlaybackStateChange) {
                this.onPlaybackStateChange(false); // Set button to 'Play'
            }
        } catch (e) {
            this.audioBuffer = null;
            throw e;
        }
    }

    play() {
        if (!this.audioBuffer) return;

        // Ensure AudioContext is running
        if (audioContext.state === 'suspended') {
            audioContext.resume().then(() => {
                this._startPlayback();
            }).catch(e => {
                console.error("Error resuming AudioContext:", e);
                window.electronAPI.logMessage(`AudioPlayer ${this.id}: Error resuming AudioContext: ${e.message}`);
            });
        } else if (audioContext.state === 'running') {
            this._startPlayback();
        }
    }

    _startPlayback() {
        if (this.isPlaying) this.stop(); // Stop if already playing

        this.source = audioContext.createBufferSource();
        this.source.buffer = this.audioBuffer;
        this.source.loop = this.loop;
        this.source.connect(this.output);
        this.source.start(0);
        this.isPlaying = true;
        if (this.onPlaybackStateChange) this.onPlaybackStateChange(true);

        // Listen for when the sound finishes playing (if not looping)
        this.source.onended = () => {
            if (!this.loop) {
                this.stop();
                if (this.onPlaybackStateChange) this.onPlaybackStateChange(false);
            }
        };
    }

    stop() {
        if (!this.isPlaying || !this.source) return;
        this.source.stop();
        this.source.disconnect();
        this.source = null;
        this.isPlaying = false;
        if (this.onPlaybackStateChange) this.onPlaybackStateChange(false);
    }

    draw(ctx, isSelected) {
        ctx.save();
        ctx.translate(this.x, this.y);

        ctx.fillStyle = '#222';
        ctx.strokeStyle = isSelected ? '#aaffff' : '#E0E0E0';
        ctx.lineWidth = 2;
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.strokeRect(0, 0, this.width, this.height);

        ctx.fillStyle = '#E0E0E0';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Audio Player', this.width / 2, 22);

        this.drawConnectors(ctx);
        ctx.restore();
    }

    drawConnectors(ctx) {
        const connectorRadius = 8;
        ctx.font = '10px Arial';

        const outputName = 'audio';
        const outputProps = this.outputs[outputName];
        const ox = outputProps.x;
        const oy = outputProps.y;
        ctx.beginPath();
        ctx.arc(ox, oy, connectorRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#f0a048';
        ctx.fill();
        ctx.textAlign = 'right';
        ctx.fillText('OUT', ox - connectorRadius - 4, oy + 4);
    }

    getConnectorAt(x, y) {
        const localX = x - this.x;
        const localY = y - this.y;
        for (const [name, props] of Object.entries(this.outputs)) {
            if (Math.sqrt(Math.pow(localX - props.x, 2) + Math.pow(localY - props.y, 2)) < 9)
                return { name, type: 'output', props, module: this };
        }
        return null;
    }

    disconnect() {
        this.stop();
        this.output.disconnect();
        if (this.decoderWorker) {
            this.decoderWorker.terminate();
        }
    }

    getState() {
        return {
            id: this.id,
            type: 'AudioPlayer',
            x: this.x,
            y: this.y,
            loop: this.loop
        };
    }

    setState(state) {
        this.id = state.id || this.id;
        this.x = state.x;
        this.y = state.y;
        this.loop = state.loop;
    }
}