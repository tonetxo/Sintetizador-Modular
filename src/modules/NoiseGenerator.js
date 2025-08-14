// src/modules/NoiseGenerator.js

export class NoiseGenerator {
  constructor(audioContext, x, y, id = null, initialState = {}) {
    this.audioContext = audioContext;
    this.id = id || `noise-gen-${Date.now()}`;
    this.type = 'NoiseGenerator';
    this.x = x;
    this.y = y;
    this.width = 100;
    this.height = 120;

    this.noiseTypes = ['white', 'pink', 'random'];
    this.currentNoiseType = initialState.noiseType !== undefined ? initialState.noiseType : 0;

    this.noiseNode = null;
    this.output = this.audioContext.createGain();

    this.readyPromise = this.initWorklet();

    this.hotspots = {
      noiseTypeSelector: { x: 10, y: 40, width: 80, height: 60 }
    };
  }

  async initWorklet() {
    try {
      this.noiseNode = new AudioWorkletNode(this.audioContext, 'noise-generator-processor');
      this.noiseNode.parameters.get('noiseType').value = this.currentNoiseType;
      this.noiseNode.connect(this.output);
    } catch (error) {
      console.error(`[NoiseGenerator-${this.id}] Error initializing worklet:`, error);
    }
  }

  get inputs() { return {}; }

  get outputs() {
    return {
      'Out': { x: this.width, y: this.height / 2, type: 'audio', source: this.output, orientation: 'horizontal' }
    };
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
    ctx.fillText('NOISE', this.width / 2, 22);
    
    ctx.font = 'bold 12px Arial';
    ctx.fillText(this.noiseTypes[this.currentNoiseType].toUpperCase(), this.width / 2, this.height / 2 + 20);
    
    this.drawConnectors(ctx, hoveredConnectorInfo);

    ctx.restore();
  }

  drawConnectors(ctx, hovered) {
    const connectorRadius = 8;
    ctx.font = '10px Arial';

    Object.entries(this.outputs).forEach(([name, props]) => {
      const ox = props.x;
      const oy = props.y;
      const isHovered = hovered?.module === this && hovered.connector?.name === name;
      
      ctx.beginPath();
      ctx.arc(ox, oy, connectorRadius, 0, Math.PI * 2);
      ctx.fillStyle = isHovered ? 'white' : '#222';
      ctx.fill();
      ctx.strokeStyle = '#4a90e2';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      
      ctx.fillStyle = '#E0E0E0';
      ctx.textAlign = 'right';
      ctx.fillText(name.toUpperCase(), ox - connectorRadius - 4, oy + 4);
    });
  }

  getConnectorAt(x, y) {
    const localX = x - this.x;
    const localY = y - this.y;
    for (const [name, props] of Object.entries(this.outputs)) {
      if (Math.hypot(localX - props.x, localY - props.y) < 9) {
          return { name, type: 'output', props, module: this };
      }
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
      return true;
    }
    return false;
  }

  getState() { return { id: this.id, type: this.type, x: this.x, y: this.y, noiseType: this.currentNoiseType }; }

  setState(state) {
    this.x = state.x; this.y = state.y;
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