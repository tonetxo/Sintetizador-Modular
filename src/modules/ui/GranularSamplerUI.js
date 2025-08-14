import { formatTime } from '../utils/timeFormatter.js';

export class GranularSamplerUI {
    constructor(granularSampler, container) {
        this.sampler = granularSampler;
        this.container = container;
        this.animationFrame = null;
        this.isDragging = false;
        this.grainVisualizationData = [];

        this.createElements();
        this.setupEventListeners();
        this.startVisualization();
    }

    createElements() {
        this.container.innerHTML = `
            <div class="granular-sampler-container">
                <div class="waveform-container">
                    <canvas class="waveform-canvas"></canvas>
                    <canvas class="grain-canvas"></canvas>
                    <div class="position-marker"></div>
                </div>
                
                <div class="controls-container">
                    <div class="control-group">
                        <label>Position
                            <input type="range" class="slider position-slider" 
                                min="0" max="1" step="0.001" value="0.5">
                            <span class="value-display">0.500</span>
                        </label>
                    </div>
                    
                    <div class="control-group">
                        <label>Grain Size
                            <input type="range" class="slider size-slider" 
                                min="0.01" max="0.5" step="0.01" value="0.1">
                            <span class="value-display">0.100 s</span>
                        </label>
                    </div>
                    
                    <div class="control-group">
                        <label>Grain Rate
                            <input type="range" class="slider rate-slider" 
                                min="1" max="100" step="1" value="10">
                            <span class="value-display">10 Hz</span>
                        </label>
                    </div>
                    
                    <div class="control-group">
                        <label>Pitch
                            <input type="range" class="slider pitch-slider" 
                                min="0.25" max="4" step="0.01" value="1">
                            <span class="value-display">1.00x</span>
                        </label>
                    </div>
                    
                    <div class="control-group">
                        <label>Spread
                            <input type="range" class="slider spread-slider" 
                                min="0" max="1" step="0.01" value="0.1">
                            <span class="value-display">0.100</span>
                        </label>
                    </div>
                    
                    <div class="control-group">
                        <label>Randomness
                            <input type="range" class="slider random-slider" 
                                min="0" max="1" step="0.01" value="0.1">
                            <span class="value-display">0.100</span>
                        </label>
                    </div>
                </div>
                
                <div class="file-drop-zone">
                    <input type="file" class="file-input" accept="audio/*">
                    <div class="drop-message">
                        Arrastra un archivo de audio aquí o haz clic para seleccionar
                    </div>
                </div>
            </div>
        `;

        // Cache elementos
        this.waveformCanvas = this.container.querySelector('.waveform-canvas');
        this.grainCanvas = this.container.querySelector('.grain-canvas');
        this.positionMarker = this.container.querySelector('.position-marker');
        this.fileInput = this.container.querySelector('.file-input');
        this.dropZone = this.container.querySelector('.file-drop-zone');

        // Cache sliders
        this.sliders = {
            position: this.container.querySelector('.position-slider'),
            size: this.container.querySelector('.size-slider'),
            rate: this.container.querySelector('.rate-slider'),
            pitch: this.container.querySelector('.pitch-slider'),
            spread: this.container.querySelector('.spread-slider'),
            random: this.container.querySelector('.random-slider')
        };

        this.valueDisplays = {};
        Object.keys(this.sliders).forEach(key => {
            this.valueDisplays[key] = this.sliders[key].parentElement.querySelector('.value-display');
        });

        this.setupCanvases();
    }

    setupCanvases() {
        const dpr = window.devicePixelRatio || 1;
        [this.waveformCanvas, this.grainCanvas].forEach(canvas => {
            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            const ctx = canvas.getContext('2d');
            ctx.scale(dpr, dpr);
        });
    }

    setupEventListeners() {
        // Manejo de archivo
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        this.dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.dropZone.classList.add('dragover');
        });
        this.dropZone.addEventListener('dragleave', () => {
            this.dropZone.classList.remove('dragover');
        });
        this.dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dropZone.classList.remove('dragover');
            this.handleFileDrop(e);
        });

        // Sliders
        Object.entries(this.sliders).forEach(([param, slider]) => {
            slider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                this.sampler.setParameter(param, value);
                this.updateValueDisplay(param, value);
            });
        });

        // Waveform interaction
        this.waveformCanvas.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.updatePosition(e);
        });

        document.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                this.updatePosition(e);
            }
        });

        document.addEventListener('mouseup', () => {
            this.isDragging = false;
        });

        // Window resize
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => this.setupCanvases(), 250);
        });
    }

    updatePosition(e) {
        const rect = this.waveformCanvas.getBoundingClientRect();
        const position = (e.clientX - rect.left) / rect.width;
        this.sampler.setParameter('position', Math.max(0, Math.min(1, position)));
        this.sliders.position.value = position;
        this.updateValueDisplay('position', position);
    }

    updateValueDisplay(param, value) {
        let displayValue;
        switch (param) {
            case 'position':
                displayValue = value.toFixed(3);
                break;
            case 'size':
                displayValue = `${value.toFixed(3)} s`;
                break;
            case 'rate':
                displayValue = `${value.toFixed(0)} Hz`;
                break;
            case 'pitch':
                displayValue = `${value.toFixed(2)}x`;
                break;
            default:
                displayValue = value.toFixed(3);
        }
        this.valueDisplays[param].textContent = displayValue;
    }

    async handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) {
            await this.loadAudioFile(file);
        }
    }

    async handleFileDrop(e) {
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('audio/')) {
            await this.loadAudioFile(file);
        }
    }

    async loadAudioFile(file) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            await this.sampler.loadDecodedData(audioBuffer);
            this.drawWaveform(audioBuffer);
        } catch (error) {
            console.error('Error loading audio file:', error);
        }
    }

    drawWaveform(audioBuffer) {
        const ctx = this.waveformCanvas.getContext('2d');
        const data = audioBuffer.getChannelData(0);
        const step = Math.ceil(data.length / this.waveformCanvas.width);
        const amp = this.waveformCanvas.height / 2;

        ctx.clearRect(0, 0, this.waveformCanvas.width, this.waveformCanvas.height);
        ctx.beginPath();
        ctx.moveTo(0, amp);

        for (let i = 0; i < this.waveformCanvas.width; i++) {
            let min = 1.0;
            let max = -1.0;
            for (let j = 0; j < step; j++) {
                const datum = data[(i * step) + j] || 0;
                if (datum < min) min = datum;
                if (datum > max) max = datum;
            }
            ctx.lineTo(i, (1 + min) * amp);
            ctx.lineTo(i, (1 + max) * amp);
        }

        ctx.strokeStyle = '#2196F3';
        ctx.stroke();
    }

    drawGrains() {
        const ctx = this.grainCanvas.getContext('2d');
        ctx.clearRect(0, 0, this.grainCanvas.width, this.grainCanvas.height);

        // Dibujar la posición actual
        const position = parseFloat(this.sliders.position.value);
        const x = position * this.grainCanvas.width;
        
        ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
        ctx.fillRect(x - 2, 0, 4, this.grainCanvas.height);

        // Dibujar granos activos
        this.grainVisualizationData.forEach(grain => {
            const grainX = grain.position * this.grainCanvas.width;
            const grainWidth = (grain.size * this.grainCanvas.width) / 2;
            
            ctx.fillStyle = `rgba(0, 255, 0, ${grain.amplitude})`;
            ctx.fillRect(grainX - grainWidth/2, 0, grainWidth, this.grainCanvas.height);
        });
    }

    startVisualization() {
        const update = () => {
            this.drawGrains();
            this.animationFrame = requestAnimationFrame(update);
        };
        update();
    }

    destroy() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }
        // Eliminar event listeners
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);
    }
}