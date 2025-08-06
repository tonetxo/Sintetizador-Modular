// modules/AudioPlayer.js
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
        console.log(`[DEBUG] AudioPlayer ${this.id} construido.`);
    }

    loadDecodedData(decodedData) {
        console.log(`[DEBUG] AudioPlayer ${this.id}: Entrando a loadDecodedData.`);
        try {
            if (this.isPlaying) this.stop();

            const newBuffer = audioContext.createBuffer(
                decodedData.numberOfChannels,
                decodedData.length,
                decodedData.sampleRate
            );

            for (let i = 0; i < decodedData.numberOfChannels; i++) {
                newBuffer.copyToChannel(new Float32Array(decodedData.channelData[i]), i);
            }

            this.audioBuffer = newBuffer;
            console.log(`[DEBUG] AudioPlayer ${this.id}: Buffer de audio creado y asignado. Duración: ${this.audioBuffer.duration}s`);
            
            if (this.onPlaybackStateChange) {
                this.onPlaybackStateChange(false);
            }
        } catch (e) {
            this.audioBuffer = null;
            console.error(`[DEBUG] AudioPlayer ${this.id}: Error en loadDecodedData:`, e);
            throw e;
        }
    }

    play() {
        console.log(`[DEBUG] AudioPlayer ${this.id}: Llamado a play(). Estado - isPlaying: ${this.isPlaying}, audioBuffer:`, this.audioBuffer ? 'Existe' : 'NULL');
        if (!this.audioBuffer || this.isPlaying) {
            console.warn(`[DEBUG] AudioPlayer ${this.id}: Play abortado. Razón: audioBuffer es ${this.audioBuffer ? 'truthy' : 'falsy'}, isPlaying es ${this.isPlaying}`);
            return;
        }

        if (audioContext.state === 'suspended') {
            audioContext.resume().then(() => this._startPlayback());
        } else {
            this._startPlayback();
        }
    }

    _startPlayback() {
        console.log(`[DEBUG] AudioPlayer ${this.id}: Entrando a _startPlayback.`);
        if (this.source) {
            this.source.onended = null;
            try { this.source.stop(); } catch(e) { /* Suppress errors */ }
            this.source.disconnect();
        }

        this.source = audioContext.createBufferSource();
        this.source.buffer = this.audioBuffer;
        this.source.loop = this.loop;
        this.source.connect(this.output);

        this.source.onended = () => {
            if (this.isPlaying) {
                this.isPlaying = false;
                this.source = null;
                if (this.onPlaybackStateChange) this.onPlaybackStateChange(false);
            }
        };

        this.source.start(0);
        this.isPlaying = true;
        console.log(`[DEBUG] AudioPlayer ${this.id}: Audio iniciado. isPlaying ahora es true.`);

        if (this.onPlaybackStateChange) {
            this.onPlaybackStateChange(true);
        }
    }

    stop() {
        console.log(`[DEBUG] AudioPlayer ${this.id}: Llamado a stop().`);
        if (!this.isPlaying || !this.source) {
            return;
        }
        
        this.isPlaying = false; 

        try { this.source.stop(); } catch (e) { /* Suppress errors */ }
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