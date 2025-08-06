// modules/Visualizer.js
import { drawBars } from './visualizations/SpectralAnalyzer.js';
import { drawConcentricWaves } from './visualizations/ConcentricWaves.js';
import { drawNeonDNA } from './visualizations/NeonDNA.js';
import { drawGalacticOrb } from './visualizations/GalacticOrb.js';

// Mapeo de nombres de estilo a funciones de dibujo
const STYLES = {
    'bars': drawBars,
    'concentric_waves': drawConcentricWaves,
    'neon_dna': drawNeonDNA,
    'galactic_orb': drawGalacticOrb,
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
        this.currentStyle = 'galactic_orb'; // Puedes poner aquí tu estilo favorito por defecto
        this.active = true;

        // Asegurarse de que el tamaño del canvas se ajusta a su contenedor
        const resizeObserver = new ResizeObserver(() => {
            requestAnimationFrame(() => {
                if (this.canvas.width !== this.canvas.offsetWidth || this.canvas.height !== this.canvas.offsetHeight) {
                    this.canvas.width = this.canvas.offsetWidth;
                    this.canvas.height = this.canvas.offsetHeight;
                }
            });
        });
        resizeObserver.observe(this.canvas.parentElement);
        
        // Asignación inicial del tamaño
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;
    }

    /**
     * Cambia el estilo de visualización actual.
     * @param {string} styleName - El nombre del estilo a activar.
     */
    setStyle(styleName) {
        if (STYLES[styleName]) {
            this.currentStyle = styleName;
            console.log(`Visualizer style set to: ${styleName}`);
        } else {
            console.warn(`Visualizer style "${styleName}" not found.`);
        }
    }

    /**
     * Dibuja el frame actual de la visualización.
     * @param {AnalyserNode} analyser - El nodo analizador de Web Audio API.
     */
    draw(analyser) {
        if (!this.active || !analyser) return;

        // Inicializar dataArray si es necesario
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