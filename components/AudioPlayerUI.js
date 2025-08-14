import { formatTime } from '../utils/timeFormatter.js';

export class AudioPlayerUI {
    constructor(audioPlayer, container) {
        this.audioPlayer = audioPlayer;
        this.container = container;
        this.animationFrame = null;
        this.isDragging = false;

        this.createElements();
        this.setupEventListeners();
        this.startUpdateLoop();
    }

    createElements() {
        this.container.innerHTML = `
            <div class="audio-player-container">
                <div class="waveform-container">
                    <canvas class="waveform-canvas"></canvas>
                </div>
                <div class="transport-controls">
                    <button class="play-button">▶</button>
                    <div class="time-display">
                        <span class="current-time">0:00</span> / 
                        <span class="total-time">0:00</span>
                    </div>
                    <div class="progress-container">
                        <div class="progress-bar"></div>
                    </div>
                </div>
                <div class="volume-controls">
                    <span class="volume-icon">🔊</span>
                    <input type="range" class="volume-slider" min="0" max="100" value="100">
                    <label class="loop-toggle">
                        <input type="checkbox" class="loop-checkbox" checked>
                        Loop
                    </label>
                </div>
            </div>
        `;

        // Cache element references
        this.playButton = this.container.querySelector('.play-button');
        this.currentTimeDisplay = this.container.querySelector('.current-time');
        this.totalTimeDisplay = this.container.querySelector('.total-time');
        this.progressBar = this.container.querySelector('.progress-bar');
        this.progressContainer = this.container.querySelector('.progress-container');
        this.volumeSlider = this.container.querySelector('.volume-slider');
        this.loopCheckbox = this.container.querySelector('.loop-checkbox');
        this.waveformCanvas = this.container.querySelector('.waveform-canvas');

        // Setup canvas
        this.setupCanvas();
    }

    setupCanvas() {
        // Set canvas size with device pixel ratio for sharp rendering
        const dpr = window.devicePixelRatio || 1;
        const rect = this.waveformCanvas.getBoundingClientRect();
        
        this.waveformCanvas.width = rect.width * dpr;
        this.waveformCanvas.height = rect.height * dpr;
        
        const ctx = this.waveformCanvas.getContext('2d');
        ctx.scale(dpr, dpr);

        this.audioPlayer.setCanvas(this.waveformCanvas);
    }

    setupEventListeners() {
        // Play/Pause button
        this.playButton.addEventListener('click', () => {
            if (this.audioPlayer.isPlaying) {
                this.audioPlayer.stop();
                this.playButton.textContent = '▶';
            } else {
                this.audioPlayer.play();
                this.playButton.textContent = '⏸';
            }
        });

        // Progress bar interaction
        this.progressContainer.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.updateProgressFromMouse(e);
        });

        document.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                this.updateProgressFromMouse(e);
            }
        });

        document.addEventListener('mouseup', () => {
            this.isDragging = false;
        });

        // Volume control
        this.volumeSlider.addEventListener('input', (e) => {
            const volume = parseFloat(e.target.value) / 100;
            this.audioPlayer.setVolume(volume);
        });

        // Loop toggle
        this.loopCheckbox.addEventListener('change', (e) => {
            this.audioPlayer.loop = e.target.checked;
        });

        // Window resize handling
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => this.setupCanvas(), 250);
        });
    }

    updateProgressFromMouse(e) {
        const rect = this.progressContainer.getBoundingClientRect();
        const position = (e.clientX - rect.left) / rect.width;
        this.audioPlayer.setPosition(position);
        this.updateProgress(position);
    }

    updateProgress(position) {
        this.progressBar.style.width = `${position * 100}%`;
    }

    startUpdateLoop() {
        const update = () => {
            if (!this.isDragging && this.audioPlayer.audioBuffer) {
                const currentTime = this.audioPlayer.getCurrentTime();
                const duration = this.audioPlayer.getDuration();
                
                // Update time displays
                this.currentTimeDisplay.textContent = formatTime(currentTime);
                this.totalTimeDisplay.textContent = formatTime(duration);

                // Update progress bar
                const progress = currentTime / duration;
                this.updateProgress(progress);
            }

            this.animationFrame = requestAnimationFrame(update);
        };

        update();
    }

    destroy() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }
        
        // Remove event listeners
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);
    }
}