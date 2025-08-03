// modules/ADSR.js
import { audioContext } from './AudioContext.js';

// Estados para el procesador ADSR
const ADSR_STATE = {
  IDLE: 0,
  ATTACK: 1,
  DECAY: 2,
  SUSTAIN: 3,
  RELEASE: 4
};

export class ADSR {
  constructor(x, y, id = null, initialState = {}) {
    this.id = id || `adsr-${Date.now()}`;
    this.x = x;
    this.y = y;
    this.width = 400;
    this.height = 300;
    this.type = 'ADSR';

    // Parámetros con valores por defecto
    this.params = {
      attack: initialState.attack || 0.01,
      decay: initialState.decay || 0.1,
      sustain: initialState.sustain || 0.8,
      release: initialState.release || 0.2
    };

    this.activeControl = null;
    this.paramHotspots = {};
    
    // Inicialización segura de conexiones
    this.inputs = {
      'Gate': { 
        x: 0, 
        y: this.height / 2, 
        type: 'gate', 
        target: null, 
        orientation: 'horizontal',
        connected: false
      }
    };
    
    this.outputs = {
      'CV': { 
        x: this.width, 
        y: this.height / 2, 
        type: 'cv', 
        source: null, 
        orientation: 'horizontal',
        connected: false 
      }
    };

    // Nodos de audio
    this.workletNode = null;
    this.keepAliveNode = null;
    
    // Parámetros de audio
    this.attackParam = null;
    this.decayParam = null;
    this.sustainParam = null;
    this.releaseParam = null;

    // Inicialización asíncrona
    this.ready = this.initWorklet(initialState).catch(err => {
      console.error(`[ADSR-${this.id}] Initialization error:`, err);
      this.setFallbackNodes();
    });
  }

  async initWorklet(initialState) {
    try {
      // Cargar el worklet si no está ya cargado
      // await audioContext.audioWorklet.addModule('worklets/adsr-processor.js');

      // Crear el nodo de trabajo
      this.workletNode = new AudioWorkletNode(audioContext, 'adsr-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        parameterData: {
          attack: this.params.attack,
          decay: this.params.decay,
          sustain: this.params.sustain,
          release: this.params.release,
        }
      });

      // Configurar conexiones keep-alive
      this.keepAliveNode = audioContext.createGain();
      this.keepAliveNode.gain.value = 0;
      this.workletNode.connect(this.keepAliveNode);
      this.keepAliveNode.connect(audioContext.destination);

      // Actualizar las conexiones de entrada/salida
      this.inputs.Gate.target = this.workletNode;
      this.outputs.CV.source = this.workletNode;

      // Obtener referencias a los parámetros
      this.attackParam = this.workletNode.parameters.get('attack');
      this.decayParam = this.workletNode.parameters.get('decay');
      this.sustainParam = this.workletNode.parameters.get('sustain');
      this.releaseParam = this.workletNode.parameters.get('release');

      // Aplicar estado inicial si existe
      if (initialState && Object.keys(initialState).length > 0) {
        this.setState(initialState);
      }

    } catch (error) {
      console.error(`[ADSR-${this.id}] Worklet initialization failed:`, error);
      this.setFallbackNodes();
      throw error;
    }
  }

  setFallbackNodes() {
    // Crear nodos de respaldo si falla el worklet
    this.workletNode = audioContext.createGain();
    this.workletNode.gain.value = 0;
    this.keepAliveNode = audioContext.createGain();
    this.keepAliveNode.gain.value = 0;
    this.workletNode.connect(this.keepAliveNode);
    this.keepAliveNode.connect(audioContext.destination);
    
    // Actualizar conexiones
    this.inputs.Gate.target = this.workletNode;
    this.outputs.CV.source = this.workletNode;
  }

  draw(ctx, isSelected, hoveredConnectorInfo) {
    ctx.save();
    ctx.translate(this.x, this.y);

    // Fondo del módulo
    ctx.fillStyle = '#222';
    ctx.strokeStyle = isSelected ? '#aaffff' : '#E0E0E0';
    ctx.lineWidth = 2;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.strokeRect(0, 0, this.width, this.height);

    // Título
    ctx.fillStyle = '#E0E0E0';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('ADSR', this.width / 2, 22);

    // Sliders
    const sliderHeight = 240;
    const sliderY = 40;
    this.drawVerticalSlider(ctx, 'attack', 60, sliderY, sliderHeight, 0.01, 2, this.params.attack);
    this.drawVerticalSlider(ctx, 'decay', 140, sliderY, sliderHeight, 0.01, 2, this.params.decay);
    this.drawVerticalSlider(ctx, 'sustain', 220, sliderY, sliderHeight, 0, 1, this.params.sustain);
    this.drawVerticalSlider(ctx, 'release', 300, sliderY, sliderHeight, 0.01, 5, this.params.release);

    ctx.restore();
    this.drawConnectors(ctx, hoveredConnectorInfo);
  }

  drawVerticalSlider(ctx, paramName, x, y, height, minVal, maxVal, currentValue) {
    const knobRadius = 8;
    
    // Etiqueta del parámetro
    ctx.fillStyle = '#E0E0E0';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(paramName.toUpperCase(), x, y - 5);

    // Barra del slider
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + height);
    ctx.stroke();

    // Knob del slider
    const normalizedValue = Math.max(0, Math.min(1, (currentValue - minVal) / (maxVal - minVal)));
    const knobY = y + height - (normalizedValue * height);

    ctx.beginPath();
    ctx.arc(x, knobY, knobRadius, 0, Math.PI * 2);
    ctx.fillStyle = this.activeControl === paramName ? '#aaffff' : '#4a90e2';
    ctx.fill();
    ctx.strokeStyle = '#E0E0E0';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    
    // Valor numérico
    ctx.fillText(currentValue.toFixed(2), x, y + height + 15);

    // Guardar área interactiva
    this.paramHotspots[paramName] = { 
      x: x - knobRadius, 
      y: y, 
      width: knobRadius * 2, 
      height: height, 
      min: minVal, 
      max: maxVal 
    };
  }
  
  drawConnectors(ctx, hovered) {
    const connectorRadius = 8;
    ctx.font = '10px Arial';

    // Conector de entrada (Gate)
    const inputName = 'Gate';
    const inputProps = this.inputs[inputName];
    const ix = this.x + inputProps.x;
    const iy = this.y + inputProps.y;
    
    ctx.beginPath();
    ctx.arc(ix, iy, connectorRadius, 0, Math.PI * 2);
    ctx.fillStyle = (hovered && hovered.module === this && hovered.connector.name === inputName) ? 'white' : '#4a90e2';
    ctx.fill();
    ctx.fillStyle = '#E0E0E0';
    ctx.textAlign = 'left';
    ctx.fillText('GATE', ix + connectorRadius + 4, iy + 4);

    // Conector de salida (CV)
    const outputName = 'CV';
    const outputProps = this.outputs[outputName];
    const ox = this.x + outputProps.x;
    const oy = this.y + outputProps.y;
    
    ctx.beginPath();
    ctx.arc(ox, oy, connectorRadius, 0, Math.PI * 2);
    ctx.fillStyle = (hovered && hovered.module === this && hovered.connector.name === outputName) ? 'white' : '#222';
    ctx.fill();
    ctx.strokeStyle = '#4a90e2';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#E0E0E0';
    ctx.textAlign = 'right';
    ctx.fillText('CV', ox - connectorRadius - 4, oy + 4);
  }

  checkInteraction(pos) {
    const localPos = { x: pos.x - this.x, y: pos.y - this.y };
    
    // Verificar si se está interactuando con algún control
    for (const [param, rect] of Object.entries(this.paramHotspots)) {
      if (localPos.x >= rect.x && localPos.x <= rect.x + rect.width &&
          localPos.y >= rect.y && localPos.y <= rect.y + rect.height) {
        this.activeControl = param;
        return true;
      }
    }
    return false;
  }

  handleDragInteraction(worldPos) {
    if (!this.activeControl) return;

    const localY = worldPos.y - this.y;
    const sliderRect = this.paramHotspots[this.activeControl];
    
    // Calcular nuevo valor normalizado
    let normalizedValue = (sliderRect.y + sliderRect.height - localY) / sliderRect.height;
    normalizedValue = Math.max(0, Math.min(1, normalizedValue));

    // Calcular nuevo valor real
    const newValue = sliderRect.min + normalizedValue * (sliderRect.max - sliderRect.min);
    this.params[this.activeControl] = newValue;

    // Actualizar parámetro de audio en tiempo real
    if (this.workletNode) {
      const param = this.workletNode.parameters.get(this.activeControl);
      if (param) {
        param.setValueAtTime(newValue, audioContext.currentTime);
      }
    }
  }

  endInteraction() {
    this.activeControl = null;
  }

  getConnectorAt(x, y) {
    const localX = x - this.x;
    const localY = y - this.y;
    
    // Buscar en las entradas
    for (const [name, props] of Object.entries(this.inputs)) {
      const distance = Math.sqrt(Math.pow(localX - props.x, 2) + Math.pow(localY - props.y, 2));
      if (distance < 9) {
        return { 
          name, 
          type: 'input', 
          props, 
          module: this 
        };
      }
    }
    
    // Buscar en las salidas
    for (const [name, props] of Object.entries(this.outputs)) {
      const distance = Math.sqrt(Math.pow(localX - props.x, 2) + Math.pow(localY - props.y, 2));
      if (distance < 9) {
        return { 
          name, 
          type: 'output', 
          props, 
          module: this 
        };
      }
    }
    
    return null;
  }

  disconnect() {
    if (this.workletNode) {
      this.workletNode.disconnect();
    }
    if (this.keepAliveNode) {
      this.keepAliveNode.disconnect();
    }
  }

  getState() {
    return {
      id: this.id, 
      type: 'ADSR', 
      x: this.x, 
      y: this.y,
      attack: this.params.attack,
      decay: this.params.decay,
      sustain: this.params.sustain,
      release: this.params.release
    };
  }

  setState(state) {
    if (!state) return;

    this.id = state.id || this.id;
    this.x = state.x !== undefined ? state.x : this.x;
    this.y = state.y !== undefined ? state.y : this.y;
    
    // Actualizar parámetros
    if (state.attack !== undefined) this.params.attack = state.attack;
    if (state.decay !== undefined) this.params.decay = state.decay;
    if (state.sustain !== undefined) this.params.sustain = state.sustain;
    if (state.release !== undefined) this.params.release = state.release;

    // Actualizar parámetros de audio si el worklet está cargado
    if (this.workletNode && this.workletNode.parameters) {
      if (state.attack !== undefined) {
        this.attackParam.setValueAtTime(state.attack, audioContext.currentTime);
      }
      if (state.decay !== undefined) {
        this.decayParam.setValueAtTime(state.decay, audioContext.currentTime);
      }
      if (state.sustain !== undefined) {
        this.sustainParam.setValueAtTime(state.sustain, audioContext.currentTime);
      }
      if (state.release !== undefined) {
        this.releaseParam.setValueAtTime(state.release, audioContext.currentTime);
      }
    }
  }
}