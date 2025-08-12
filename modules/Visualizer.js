// modules/Visualizer.js
import { drawBars } from './visualizations/SpectralAnalyzer.js';
import { drawConcentricWaves } from './visualizations/ConcentricWaves.js';
import { drawNeonDNA } from './visualizations/NeonDNA.js';
import { drawGalacticOrb } from './visualizations/GalacticOrb.js';
import { drawLavaLamp } from './visualizations/LavaLamp.js'; // <-- NUEVO
import { drawStardustField } from './visualizations/StardustField.js'; // <-- NUEVO

// Mapeo de nombres de estilo a funciones de dibujo
const STYLES = {
    'bars': drawBars,
    'concentric_waves': drawConcentricWaves,
    'neon_dna': drawNeonDNA,
    'galactic_orb': drawGalacticOrb,
    'lava_lamp': drawLavaLamp, // <-- NUEVO
    'stardust_field': drawStardustField, // <-- NUEVO
};

export class Visualizer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.error(`Visualizer Error: Canvas with id "${canvasId}" not found.`);
            this.active = false;
            return;
        }
        this.ctx = this.canvas.getContext('2d');
        this.dataArray = null;
        this.currentStyle = 'galactic_orb';
        this.active = true;

        const resizeObserver = new ResizeObserver(() => {
            requestAnimationFrame(() => {
                if (this.canvas.width !== this.canvas.offsetWidth || this.canvas.height !== this.canvas.offsetHeight) {
                    this.canvas.width = this.canvas.offsetWidth;
                    this.canvas.height = this.canvas.offsetHeight;
                }
            });
        });
        resizeObserver.observe(this.canvas.parentElement);
        
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;
    }

    setStyle(styleName) {
        if (STYLES[styleName]) {
            this.currentStyle = styleName;
            console.log(`Visualizer style set to: ${styleName}`);
        } else {
            console.warn(`Visualizer style "${styleName}" not found.`);
        }
    }

    draw(analyser) {
        if (!this.active || !analyser) return;

        if (!this.dataArray || this.dataArray.length !== analyser.frequencyBinCount) {
            this.dataArray = new Uint8Array(analyser.frequencyBinCount);
        }

        analyser.getByteFrequencyData(this.dataArray);
        
        const drawFunction = STYLES[this.currentStyle];
        if (drawFunction) {
            drawFunction(this.ctx, this.dataArray, this.canvas.width, this.canvas.height);
        }
    }
}