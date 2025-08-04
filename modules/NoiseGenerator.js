// modules/NoiseGenerator.js
import { audioContext } from './AudioContext.js';

export class NoiseGenerator {
  constructor(x, y, id = null, initialState = {}) {
    this.id = id || `noise-gen-${Date.now()}`;
    this.type = 'NoiseGenerator';
    this.x = x;
    this.y = y;
    this.width = 100; // Mismo tamaño que RingMod
    this.height = 120;

    this.noiseTypes = ['white', 'pink', 'random'];
    this.currentNoiseType = initialState.noiseType !== undefined ? initialState.noiseType : 0; // 0: white, 1: pink, 2: random

    this.noiseNode = null;
    this.output = audioContext.createGain(); // Salida principal del módulo

    this.readyPromise = this.initWorklet();

    // Crear el elemento UI para mostrar el tipo de ruido
    this.ui = document.createElement('div');
    this.ui.className = 'module-ui-overlay';
    this.ui.style.cssText = `
      position: absolute;
      width: ${this.width}px;
      height: ${this.height - 30}px; /* Altura del contenido, restando la barra de título */
      top: ${this.y + 30}px;
      left: ${this.x}px;
      background-color: transparent;
      pointer-events: none; /* Permite que los eventos de ratón pasen a través */
      display: flex;
      justify-content: center;
      align-items: center;
      flex-direction: column;
    `;
    document.body.appendChild(this.ui);

    this.noiseTypeDisplay = document.createElement('div');
    this.noiseTypeDisplay.style.cssText = `
      width: 80px;
      height: 20px;
      background-color: #333;
      border: 1px solid #555;
      color: #0f0;
      display: flex;
      justify-content: center;
      align-items: center;
      font-family: 'Cascadia Code', monospace;
      font-size: 12px;
      cursor: pointer;
      pointer-events: all; /* Habilita eventos de ratón para este elemento */
      margin-top: 10px;
    `;
    this.updateNoiseTypeDisplay();

    this.noiseTypeDisplay.addEventListener('click', () => {
      this.currentNoiseType = (this.currentNoiseType + 1) % this.noiseTypes.length;
      if (this.noiseNode) {
        this.noiseNode.parameters.get('noiseType').value = this.currentNoiseType;
      }
      this.updateNoiseTypeDisplay();
    });

    this.ui.appendChild(this.noiseTypeDisplay);
  }

  async initWorklet() {
    try {
      await audioContext.audioWorklet.addModule('./worklets/noise-generator-processor.js');
      this.noiseNode = new AudioWorkletNode(audioContext, 'noise-generator-processor');
      this.noiseNode.parameters.get('noiseType').value = this.currentNoiseType;
      this.noiseNode.connect(this.output);
    } catch (error) {
      console.error(`[NoiseGenerator-${this.id}] Error initializing worklet:`, error);
    }
  }

  updateNoiseTypeDisplay() {
    this.noiseTypeDisplay.textContent = this.noiseTypes[this.currentNoiseType].toUpperCase();
  }

  get inputs() {
    return {}; // No inputs for a simple noise generator
  }

  get outputs() {
    return {
      'Out': { x: this.width / 2, y: this.height, type: 'audio', source: this.output, orientation: 'vertical' }
    };
  }

  draw(ctx, isSelected, hoveredConnectorInfo) {
    // Dibujar el cuerpo del módulo (similar a createModule en renderer.js)
    ctx.save();
    ctx.translate(this.x, this.y);

    ctx.fillStyle = '#1a1a1a';
    ctx.strokeStyle = isSelected ? '#aaffff' : '#888';
    ctx.lineWidth = 2;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.strokeRect(0, 0, this.width, this.height);

    // Barra de título
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, this.width, 20);
    ctx.strokeStyle = '#555';
    ctx.strokeRect(0, 0, this.width, 20);

    ctx.fillStyle = '#E0E0E0';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Noise Gen', this.width / 2, 10);

    // Dibujar conectores
    const connectorRadius = 8;
    ctx.font = '10px Arial';

    Object.entries(this.outputs).forEach(([name, props]) => {
      const ox = props.x;
      const oy = props.y;
      const isHovered = hoveredConnectorInfo?.module === this && hoveredConnectorInfo.connector.name === name;
      ctx.beginPath();
      ctx.arc(ox, oy, connectorRadius, 0, Math.PI * 2);
      ctx.fillStyle = isHovered ? 'white' : '#e24a90';
      ctx.fill();
      ctx.strokeStyle = '#4a90e2';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#E0E0E0';
      ctx.textAlign = 'center';
      ctx.fillText(name.toUpperCase(), ox, oy - connectorRadius - 4);
    });

    ctx.restore();

    // Actualizar la posición del UI div
    this.ui.style.left = `${this.x}px`;
    this.ui.style.top = `${this.y + 30}px`;
  }

  getConnectorAt(x, y) {
    const localX = x - this.x;
    const localY = y - this.y;

    for (const [name, props] of Object.entries(this.outputs)) {
      if (Math.hypot(localX - props.x, localY - props.y) < 9) return { name, type: 'output', props, module: this };
    }
    return null;
  }

  getState() {
    return {
      id: this.id,
      type: this.type,
      x: this.x,
      y: this.y,
      noiseType: this.currentNoiseType
    };
  }

  setState(state) {
    this.x = state.x;
    this.y = state.y;
    this.currentNoiseType = state.noiseType !== undefined ? state.noiseType : 0;
    if (this.noiseNode) {
      this.noiseNode.parameters.get('noiseType').value = this.currentNoiseType;
    }
    this.updateNoiseTypeDisplay();
  }

  disconnect() {
    this.noiseNode?.disconnect();
    this.output?.disconnect();
    this.ui?.remove(); // Eliminar el elemento UI del DOM
  }
}
