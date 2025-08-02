import { audioContext } from './AudioContext.js';

export class AudioPlayer {
    constructor(x, y, id = null, initialState = {}) {
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

        if (initialState.audioData) {
            this.loadFromState(initialState.audioData);
        }
    }

    async loadFile(file) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            this.audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            console.log('Audio file loaded and decoded successfully.');
            if (this.isPlaying) {
                this.stop();
                this.play();
            }
        } catch (err) {
            console.error('Error loading or decoding audio file:', err);
            alert('Failed to load audio file. Please choose a valid audio format.');
        }
    }

    async loadFromState(audioData) {
        try {
            const buffer = new Uint8Array(audioData).buffer;
            this.audioBuffer = await audioContext.decodeAudioData(buffer);
        } catch (error) {
            console.error('Error decoding audio data from state:', error);
        }
    }

    play() {
        if (this.isPlaying || !this.audioBuffer) return;
        this.source = audioContext.createBufferSource();
        this.source.buffer = this.audioBuffer;
        this.source.loop = this.loop;
        this.source.connect(this.output);
        this.source.start();
        this.isPlaying = true;
    }

    stop() {
        if (!this.isPlaying || !this.source) return;
        this.source.stop();
        this.source.disconnect();
        this.source = null;
        this.isPlaying = false;
    }

    draw(ctx, isSelected, hoveredConnectorInfo) {
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

        this.drawConnectors(ctx, hoveredConnectorInfo);
        ctx.restore();
    }

    drawConnectors(ctx, hovered) {
        const connectorRadius = 8;
        ctx.font = '10px Arial';

        const outputName = 'audio';
        const outputProps = this.outputs[outputName];
        const ox = outputProps.x;
        const oy = outputProps.y;
        ctx.beginPath();
        ctx.arc(ox, oy, connectorRadius, 0, Math.PI * 2);
        ctx.fillStyle = (hovered && hovered.module === this && hovered.connector.name === outputName) ? 'white' : '#222';
        ctx.fill();
        ctx.strokeStyle = '#f0a048';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = '#E0E0E0';
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
    }

    async getState() {
        let audioData = null;
        if (this.audioBuffer) {
            // This is tricky, we can't directly get the raw file data.
            // A better approach would be to store the file path or the raw ArrayBuffer on load.
            // For now, we'll skip saving the audio data itself.
        }
        return {
            id: this.id, type: 'AudioPlayer', x: this.x, y: this.y, loop: this.loop
        };
    }

    setState(state) {
        this.id = state.id || this.id;
        this.x = state.x;
        this.y = state.y;
        this.loop = state.loop;
    }
}