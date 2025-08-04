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

    // Hotspot para el clic en el selector de tipo de ruido
    this.hotspots = {
      noiseTypeSelector: { x: this.width / 2 - 30, y: this.height / 2 - 10, width: 60, height: 20, type: 'selector' }
    };
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

  get inputs() {
    return {}; // No inputs for a simple noise generator
  }

  get outputs() {
    // Conector de salida a la derecha, centrado verticalmente
    return {
      'Out': { x: this.width, y: this.height / 2, type: 'audio', source: this.output, orientation: 'horizontal' }
    };
  }

  draw(ctx, isSelected, hoveredConnectorInfo) {
    ctx.save();
    ctx.translate(this.x, this.y);

    // Dibujar el cuerpo del módulo
    ctx.fillStyle = '#222';
    ctx.strokeStyle = isSelected ? '#aaffff' : '#E0E0E0';
    ctx.lineWidth = 2;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.strokeRect(0, 0, this.width, this.height);

    // Título del módulo
    ctx.fillStyle = '#E0E0E0';
    ctx.font = '18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('NOISE', this.width / 2, 25);

    // Dibujar el símbolo del tipo de ruido
    ctx.save();
    ctx.translate(this.width / 2, this.height / 2 + 10); // Posición central para el símbolo
    ctx.strokeStyle = '#E0E0E0';
    ctx.lineWidth = 2;

    switch (this.currentNoiseType) {
      case 0: // WHITE (estrella)
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          ctx.lineTo(Math.cos((18 + i * 72) * Math.PI / 180) * 20, -Math.sin((18 + i * 72) * Math.PI / 180) * 20);
          ctx.lineTo(Math.cos((54 + i * 72) * Math.PI / 180) * 8, -Math.sin((54 + i * 72) * Math.PI / 180) * 8);
        }
        ctx.closePath();
        ctx.stroke();
        break;
      case 1: // PINK (asterisco)
        ctx.beginPath();
        ctx.moveTo(-20, 0);
        ctx.lineTo(20, 0);
        ctx.moveTo(0, -20);
        ctx.lineTo(0, 20);
        ctx.moveTo(-14, -14);
        ctx.lineTo(14, 14);
        ctx.moveTo(14, -14);
        ctx.lineTo(-14, 14);
        ctx.stroke();
        break;
      case 2: { // RANDOM (puntos aleatorios sin relleno)
        const circleRadius = 20; // Radio del círculo imaginario
        const numPoints = 5; // 4 o 5 puntos
        const pointRadius = 2; // Radio de cada punto

        ctx.beginPath();
        for (let i = 0; i < numPoints; i++) {
          // Generar coordenadas aleatorias dentro del círculo
          const angle = Math.random() * Math.PI * 2;
          const r = Math.random() * circleRadius;
          const x = r * Math.cos(angle);
          const y = r * Math.sin(angle);
          ctx.arc(x, y, pointRadius, 0, Math.PI * 2);
        }
        ctx.stroke(); // Dibuja solo el contorno de los puntos
        break;
      }
    }
    ctx.restore();

    // Dibujar conectores
    const connectorRadius = 8;
    ctx.font = '10px Arial';

    Object.entries(this.outputs).forEach(([name, props]) => {
      const ox = props.x;
      const oy = props.y;
      const isHovered = hoveredConnectorInfo?.module === this && hoveredConnectorInfo.connector.name === name;
      ctx.beginPath();
      ctx.arc(ox, oy, connectorRadius, 0, Math.PI * 2);
      ctx.fillStyle = isHovered ? 'white' : '#4a90e2'; // Azul para la salida
      ctx.fill();
      ctx.strokeStyle = '#4a90e2';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#E0E0E0';
      ctx.textAlign = 'right'; // Alineado a la derecha para el texto del conector
      ctx.fillText(name.toUpperCase(), ox - connectorRadius - 4, oy + 4);
    });

    ctx.restore();
  }

  getConnectorAt(x, y) {
    const localX = x - this.x;
    const localY = y - this.y;

    // Comprobar conectores de salida
    for (const [name, props] of Object.entries(this.outputs)) {
      if (Math.hypot(localX - props.x, localY - props.y) < 9) return { name, type: 'output', props, module: this };
    }

    // Comprobar hotspot del selector de tipo de ruido
    const selectorHotspot = this.hotspots.noiseTypeSelector;
    if (localX >= selectorHotspot.x && localX <= selectorHotspot.x + selectorHotspot.width &&
        localY >= selectorHotspot.y && localY <= selectorHotspot.y + selectorHotspot.height) {
      return { name: 'noiseTypeSelector', type: 'internal', props: selectorHotspot, module: this };
    }

    return null;
  }

  handleClick(x, y) {
    const localX = x - this.x;
    const localY = y - this.y;
    const selectorHotspot = this.hotspots.noiseTypeSelector;

    if (localX >= selectorHotspot.x && localX <= selectorHotspot.x + selectorHotspot.width &&
        localY >= selectorHotspot.y && localY <= selectorHotspot.y + selectorHotspot.height) {
      this.currentNoiseType = (this.currentNoiseType + 1) % this.noiseTypes.length;
      if (this.noiseNode) {
        this.noiseNode.parameters.get('noiseType').value = this.currentNoiseType;
      }
      return true; // Indica que el clic fue manejado
    }
    return false;
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
  }

  disconnect() {
    this.noiseNode?.disconnect();
    this.output?.disconnect();
  }
}
