// src/modules/audio/AudioPlayer.js
export class AudioPlayer {
    constructor(audioContext, x, y, id = null, initialState = {}) {
        this.audioContext = audioContext;
        this.id = id || `audioplayer-${Date.now()}`;
        this.x = x;
        this.y = y;
        this.width = 250;
        this.height = 180;
        this.type = 'AudioPlayer';

        this.audioBuffer = null;
        this.source = null;
        this.gainNode = this.audioContext.createGain();
        this.output = this.gainNode;

        this.isPlaying = false;
        this.loop = true;
        this.startTime = 0;
        this.pauseTime = 0;

        this.outputs = {
            'Out': { x: this.width, y: this.height / 2, type: 'audio', source: this.output }
        };
        this.inputs = {
            'Gain CV': { x: 0, y: this.height / 2, type: 'cv', target: this.gainNode.gain }
        };
    }

    async loadDecodedData(audioBuffer) {
        if (this.isPlaying) {
            this.stop();
        }
        this.audioBuffer = audioBuffer;
        this.pauseTime = 0;
    }

    play() {
        if (!this.audioBuffer || this.isPlaying) return;
        if (this.audioContext.state === 'suspended') this.audioContext.resume();

        this.source = this.audioContext.createBufferSource();
        this.source.buffer = this.audioBuffer;
        this.source.loop = this.loop;
        this.source.connect(this.gainNode);

        this.source.onended = () => {
            if (this.source && !this.source.loop) {
                this.isPlaying = false;
                this.pauseTime = 0;
                this.source = null;
            }
        };

        this.startTime = this.audioContext.currentTime - this.pauseTime;
        this.source.start(0, this.pauseTime % this.audioBuffer.duration);
        this.isPlaying = true;
    }

    stop() {
        if (!this.isPlaying || !this.source) return;
        this.pauseTime = this.audioContext.currentTime - this.startTime;
        this.source.stop();
        this.isPlaying = false;
    }
    
    handleClick(x,y) {
        const local = {x: x - this.x, y: y - this.y};
        const loadBtn = {x: 10, y: this.height - 40, w: 110, h: 30};
        const playBtn = {x: 130, y: this.height - 40, w: 110, h: 30};

        if (local.y > loadBtn.y && local.y < loadBtn.y + loadBtn.h) {
            if (local.x > loadBtn.x && local.x < loadBtn.x + loadBtn.w) {
                // --- CORRECCIÓN --- Usar el método no bloqueante
                window.api.requestAudioFile(this.id);
                return true;
            }
            if (local.x > playBtn.x && local.x < playBtn.x + playBtn.w) {
                this.isPlaying ? this.stop() : this.play();
                return true;
            }
        }
        return false;
    }

    draw(ctx, isSelected, hoveredConnector) {
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
        ctx.fillText('AUDIO PLAYER', this.width / 2, 22);

        ctx.font = '12px Arial';
        const statusText = this.audioBuffer ? `D: ${this.audioBuffer.duration.toFixed(1)}s` : 'No audio loaded';
        ctx.fillText(statusText, this.width/2, this.height/2);

        const loadBtn = {x: 10, y: this.height - 40, w: 110, h: 30};
        ctx.fillStyle = '#333';
        ctx.fillRect(loadBtn.x, loadBtn.y, loadBtn.w, loadBtn.h);
        ctx.fillStyle = '#E0E0E0';
        ctx.font = 'bold 12px Arial';
        ctx.fillText('LOAD AUDIO', loadBtn.x + loadBtn.w/2, loadBtn.y + 19);

        const playBtn = {x: 130, y: this.height - 40, w: 110, h: 30};
        ctx.fillStyle = this.isPlaying ? '#4a90e2' : '#333';
        ctx.fillRect(playBtn.x, playBtn.y, playBtn.w, playBtn.h);
        ctx.fillStyle = '#E0E0E0';
        ctx.fillText(this.isPlaying ? 'STOP' : 'PLAY', playBtn.x + playBtn.w/2, playBtn.y + 19);

        this.drawConnectors(ctx, hoveredConnector);
        ctx.restore();
    }
    
    drawConnectors(ctx, hovered) {
        const r = 8;
        ctx.font = '10px Arial';
        Object.entries(this.inputs).forEach(([name, props]) => {
            const isHovered = hovered?.module === this && hovered.connector?.name === name;
            ctx.beginPath(); ctx.arc(props.x, props.y, r, 0, 2 * Math.PI);
            ctx.fillStyle = isHovered ? 'white' : '#4a90e2'; ctx.fill();
            ctx.fillStyle = '#E0E0E0'; ctx.textAlign = 'left';
            ctx.fillText(name, props.x + r + 4, props.y + 4);
        });
        Object.entries(this.outputs).forEach(([name, props]) => {
            const isHovered = hovered?.module === this && hovered.connector?.name === name;
            ctx.beginPath(); ctx.arc(props.x, props.y, r, 0, 2 * Math.PI);
            ctx.fillStyle = isHovered ? 'white' : '#222'; ctx.fill();
            ctx.strokeStyle = '#4a90e2'; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.fillStyle = '#E0E0E0'; ctx.textAlign = 'right';
            ctx.fillText(name, props.x - r - 4, props.y + 4);
        });
    }

    getConnectorAt(x, y) {
        const local = { x: x - this.x, y: y - this.y };
        for (const [name, props] of Object.entries(this.inputs)) {
            if (Math.hypot(local.x - props.x, local.y - props.y) < 9) return { name, type: 'input', props, module: this };
        }
        for (const [name, props] of Object.entries(this.outputs)) {
            if (Math.hypot(local.x - props.x, local.y - props.y) < 9) return { name, type: 'output', props, module: this };
        }
        return null;
    }

    checkInteraction() { return false; }
    endInteraction() {}
    handleDragInteraction() {}
    
    getState() { return { id: this.id, type: this.type, x: this.x, y: this.y }; }
    setState(state) { this.x = state.x; this.y = state.y; }

    destroy() {
        this.stop();
        this.gainNode.disconnect();
    }
}