// renderer.js
console.log('[DEBUG] renderer.js script started');
window.electronAPI.logMessage('[DEBUG] renderer.js script started');

import { audioContext, onAudioReady } from './modules/AudioContext.js';
import { VCO } from './modules/VCO.js';
import { VCF } from './modules/VCF.js';
import { ADSR } from './modules/ADSR.js';
import { VCA } from './modules/VCA.js';
import { LFO } from './modules/LFO.js';
import { Mixer } from './modules/Mixer.js';
import { RingMod } from './modules/RingMod.js';
import { SampleAndHold } from './modules/SampleAndHold.js';
import { Sequencer } from './modules/Sequencer.js';
import { Keyboard } from './modules/Keyboard.js';
import { Osciloscopio } from './modules/Osciloscopio.js';
import { Delay } from './modules/Delay.js';
import { Compressor } from './modules/Compressor.js';
import { Reverb } from './modules/Reverb.js';
import { Microphone } from './modules/Microphone.js';
import { AudioPlayer } from './modules/AudioPlayer.js';

import { Vocoder } from './modules/Vocoder.js';
import { MathModule } from './modules/Math.js';
import { NoiseGenerator } from './modules/NoiseGenerator.js';

// DOM Elements
const canvas = document.getElementById('synth-canvas');
const ctx = canvas.getContext('2d');
const contextMenu = document.getElementById('context-menu');
const patchContextMenu = document.getElementById('patch-context-menu');
const visualizerCanvas = document.getElementById('visualizer-canvas');
const visualizerCtx = visualizerCanvas.getContext('2d');
const visualizerContextMenu = document.getElementById('visualizer-context-menu');

const errorMessage = document.getElementById('error-message');

// Application State
const MODULE_CLASSES = {
  VCO, VCF, ADSR, VCA, LFO, Mixer, RingMod,
  SampleAndHold, Sequencer, Osciloscopio, Delay,
  Compressor, Reverb, Keyboard, Math: MathModule,
  Microphone, AudioPlayer, Vocoder, NoiseGenerator
};

let modules = [];
let connections = [];
let selectedModules = [];
let selectedConnection = null;
let draggingModule = null;
let interactingModule = null;
let dragOffset = { x: 0, y: 0 };
let isPatching = false;
let patchStart = null;
let isPanning = false;
let mousePos = { x: 0, y: 0 };
let hoveredConnectorInfo = null;
let analyser = null;
let dataArray = null;

let isDraggingVisualizer = false;
let visualizerDragOffset = { x: 0, y: 0 };
let currentVisualStyle = 'bars'; // 'bars' or 'concentric_waves'

// View settings
const view = { x: 0, y: 0, zoom: 1, minZoom: 0.2, maxZoom: 2.0 };
const CABLE_COLORS = { audio: '#f0a048', cv: '#ff80ab', gate: '#ff80ab' };

// Helper Functions
function screenToWorld(x, y) {
  return { x: (x - view.x) / view.zoom, y: (y - view.y) / view.zoom };
}

function showError(message, duration = 5000) {
  errorMessage.textContent = message;
  errorMessage.style.display = 'block';
  setTimeout(() => errorMessage.style.display = 'none', duration);
}

async function loadWorklet(workletName, workletPath, maxRetries = 3) {
  let retries = 0;
  let lastError = null;

  while (retries < maxRetries) {
    try {
      console.log(`Loading ${workletName} worklet (attempt ${retries + 1})...`);
      await audioContext.audioWorklet.addModule(workletPath);
      console.log(`${workletName} worklet loaded successfully`);
      return true;
    } catch (error) {
      lastError = error;
      retries++;
      if (retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 500 * retries));
      }
    }
  }

  console.error(`Failed to load ${workletName} worklet after ${maxRetries} attempts:`, lastError);
  showError(`Error loading ${workletName} module. Some features may not work.`);
  return false;
}

async function initAudioContext() {
  return new Promise((resolve) => {
    onAudioReady(() => {
      console.log('AudioContext ready for use');
      
      resolve();
    });
  });
}

// Drawing Functions
function draw() {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  ctx.save();
  ctx.translate(view.x, view.y);
  ctx.scale(view.zoom, view.zoom);

  drawGrid();
  drawConnections();
  if (isPatching) {
    drawActivePatch();
  }
  drawModules();
  drawAudioVisualization();

  ctx.restore();
  requestAnimationFrame(draw);
}

function drawGrid() {
  const gridSize = 20 * view.zoom;
  const offsetX = view.x % gridSize;
  const offsetY = view.y % gridSize;

  ctx.fillStyle = '#3c3c3c';
  ctx.fillRect(-view.x / view.zoom, -view.y / view.zoom,
               canvas.width / view.zoom, canvas.height / view.zoom);

  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = 0.5;

  for (let x = -offsetX; x < canvas.width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x / view.zoom, -view.y / view.zoom);
    ctx.lineTo(x / view.zoom, (canvas.height - view.y) / view.zoom);
    ctx.stroke();
  }

  for (let y = -offsetY; y < canvas.height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(-view.x / view.zoom, y / view.zoom);
    ctx.lineTo((canvas.width - view.x) / view.zoom, y / view.zoom);
    ctx.stroke();
  }
}

function drawConnections() {
  ctx.lineWidth = 3.5;
  connections.forEach(conn => {
    const fromPos = getConnectorPosition(conn.fromModule, conn.fromConnector.props);
    const toPos = getConnectorPosition(conn.toModule, conn.toConnector.props);

    const dist = Math.sqrt(Math.pow(toPos.x - fromPos.x, 2) + Math.pow(toPos.y - fromPos.y, 2));
    const droop = Math.min(100, dist * 0.4);

    const cp1x = fromPos.x + (conn.fromConnector.props.orientation === 'horizontal' ? droop : 0);
    const cp1y = fromPos.y + (conn.fromConnector.props.orientation === 'vertical' ? droop : 0);
    const cp2x = toPos.x - (conn.toConnector.props.orientation === 'horizontal' ? droop : 0);
    const cp2y = toPos.y + (conn.toConnector.props.orientation === 'vertical' ? droop : 0);

    ctx.beginPath();
    ctx.moveTo(fromPos.x, fromPos.y);
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, toPos.x, toPos.y);
    ctx.strokeStyle = (conn === selectedConnection) ? 'white' : (CABLE_COLORS[conn.type] || '#888');
    ctx.stroke();
  });
}

function drawActivePatch() {
  ctx.strokeStyle = CABLE_COLORS[patchStart.connector.props.type] || '#888';
  const fromPos = getConnectorPosition(patchStart.module, patchStart.connector.props);
  const worldMouse = screenToWorld(mousePos.x, mousePos.y);

  const dist = Math.sqrt(Math.pow(worldMouse.x - fromPos.x, 2) + Math.pow(worldMouse.y - fromPos.y, 2));
  const droop = Math.min(100, dist * 0.4);

  const cp1x = fromPos.x + (patchStart.connector.props.orientation === 'horizontal' ? droop : 0);
  const cp1y = fromPos.y + (patchStart.connector.props.orientation === 'vertical' ? droop : 0);

  ctx.beginPath();
  ctx.moveTo(fromPos.x, fromPos.y);
  ctx.bezierCurveTo(cp1x, cp1y, worldMouse.x, worldMouse.y - droop, worldMouse.x, worldMouse.y);
  ctx.stroke();
}

function drawModules() {
  modules.forEach(module => {
    module.draw(ctx, selectedModules.includes(module), hoveredConnectorInfo);
    updateModuleUI(module);
  });
}

function drawAudioVisualization() {
    if (!analyser || !dataArray) return;

    analyser.getByteFrequencyData(dataArray);
    visualizerCtx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);

    switch (currentVisualStyle) {
        case 'bars':
            drawBarsVisualization();
            break;
        case 'concentric_waves':
            drawConcentricWavesVisualization();
            break;
    }
}

function drawBarsVisualization() {
    const width = visualizerCanvas.width;
    const height = visualizerCanvas.height;
    const barWidth = (width / dataArray.length) * 2.5;
    let x = 0;

    for (let i = 0; i < dataArray.length; i++) {
        const barHeight = (dataArray[i] / 255.0) * height;
        visualizerCtx.fillStyle = `rgb(${dataArray[i] + 100}, 50, 50)`;
        visualizerCtx.fillRect(x, height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
    }
}

function drawConcentricWavesVisualization() {
    const width = visualizerCanvas.width;
    const height = visualizerCanvas.height;
    
    visualizerCtx.fillStyle = '#1a1a1a';
    visualizerCtx.fillRect(0, 0, width, height);

    const bufferLength = dataArray.length;
    // Ajustar las bandas de frecuencia para una mejor separación
    const lowFreqBand = Math.floor(bufferLength * 0.05); // Graves (0-5%)
    const midFreqBand = Math.floor(bufferLength * 0.25); // Medios (5-25%)
    // High freq band is the rest (25%-100%)

    let lowEnergy = 0;
    let midEnergy = 0;
    let highEnergy = 0;
    let totalEnergy = 0;

    for (let i = 0; i < bufferLength; i++) {
        const value = dataArray[i];
        const squaredValue = value * value;
        totalEnergy += squaredValue;

        if (i < lowFreqBand) {
            lowEnergy += squaredValue;
        } else if (i < midFreqBand) {
            midEnergy += squaredValue;
        } else {
            highEnergy += squaredValue;
        }
    }

    const rms = Math.sqrt(totalEnergy / bufferLength);

    // Reducir el umbral para que se dibuje más a menudo
    if (rms < 2) return; 

    // Normalize energies - usar la suma total para normalizar, no el máximo entre ellas
    const sumOfBandEnergies = lowEnergy + midEnergy + highEnergy;
    const normalizedLow = sumOfBandEnergies > 0 ? lowEnergy / sumOfBandEnergies : 0;
    const normalizedMid = sumOfBandEnergies > 0 ? midEnergy / sumOfBandEnergies : 0;
    const normalizedHigh = sumOfBandEnergies > 0 ? highEnergy / sumOfBandEnergies : 0;

    let weightedSum = 0;
    let totalWeight = 0;
    for (let i = 1; i < bufferLength; i++) {
        const weight = dataArray[i]; // Usar el valor directamente, no el cuadrado, para un promedio más suave
        weightedSum += i * weight;
        totalWeight += weight;
    }

    const averageIndex = totalWeight === 0 ? 0 : weightedSum / totalWeight;

    // Dynamic positioning based on overall frequency content and intensity
    const freqRatio = averageIndex / bufferLength;
    // Aumentar el rango de movimiento horizontal y vertical
    const originX = width / 2 + (freqRatio - 0.5) * (width * 0.8); 
    const originY = height / 2 + ((rms / 255) - 0.5) * (height * 0.6); // Usar 255 para normalizar RMS

    // Visual parameters based on energy bands
    const baseRadius = rms * 1.5; // Base size influenced by overall intensity, slightly larger
    // Hacer el número de círculos más dinámico y con un rango más amplio
    const numCircles = 2 + Math.floor(rms / 20) + Math.floor(normalizedMid * 10); 
    const maxRadius = baseRadius + (normalizedLow * width * 0.2); // Lows expand max radius more
    const lineWidth = 1 + (normalizedHigh * 5); // Highs affect line thickness more

    // Dynamic color based on dominant frequency band
    let hue = 0; 
    if (normalizedLow > normalizedMid && normalizedLow > normalizedHigh) {
        hue = 0; // Red for bass
    } else if (normalizedMid > normalizedLow && normalizedMid > normalizedHigh) {
        hue = 120; // Green for mids
    } else if (normalizedHigh > normalizedLow && normalizedHigh > normalizedMid) {
        hue = 240; // Blue for highs
    } else {
        // Si no hay una banda dominante clara, usar un gradiente basado en la frecuencia promedio
        hue = (averageIndex / bufferLength) * 360; 
    }
    
    // Add a subtle glow/blur effect based on overall intensity
    visualizerCtx.shadowBlur = rms / 20; // Más sensible al RMS
    visualizerCtx.shadowColor = `hsla(${hue}, 100%, 70%, 0.7)`;

    for (let i = 1; i <= numCircles; i++) {
        const radius = (i / numCircles) * maxRadius;
        const alpha = 1 - (i / numCircles); // Fades out further circles

        visualizerCtx.strokeStyle = `hsla(${hue}, 100%, 60%, ${alpha * 0.8})`;
        visualizerCtx.fillStyle = `hsla(${hue}, 100%, 50%, ${alpha * 0.1})`;
        visualizerCtx.lineWidth = lineWidth;

        visualizerCtx.beginPath();
        visualizerCtx.arc(originX, originY, radius, 0, Math.PI * 2);
        visualizerCtx.stroke();
        visualizerCtx.fill();
    }
    visualizerCtx.shadowBlur = 0; // Reset shadow for other drawings
}


function updateModuleUI(module) {
  if (module.ui) {
    const screenX = module.x * view.zoom + view.x;
    const screenY = (module.y + 30) * view.zoom + view.y;
    module.ui.style.left = `${screenX}px`;
    module.ui.style.top = `${screenY}px`;
    module.ui.style.display = 'block';
  }
}

function getConnectorPosition(module, connector) {
  return {
    x: module.x + connector.x,
    y: module.y + connector.y
  };
}

// Audio Connection Functions

// Audio Connection Functions
function connectNodes(sourceConnector, destConnector) {
  try {
    const sourceNode = sourceConnector.source;
    const destTargets = Array.isArray(destConnector.target) ? destConnector.target : [destConnector.target];

    if (!sourceNode || !destTargets || destTargets.length === 0) {
      console.error("Invalid connection attempt:", { sourceConnector, destConnector });
      return false;
    }

    const outputIndex = sourceConnector.port || 0;

    destTargets.forEach(destNode => {
      if (!destNode) return;
      const inputIndex = destConnector.inputIndex || 0;

      try {
        if (destNode instanceof AudioParam) {
          sourceNode.connect(destNode, outputIndex);
        } else {
          sourceNode.connect(destNode, outputIndex, inputIndex);
        }
      } catch (connectError) {
        console.error("Connection error:", connectError);
      }
    });

    return true;
  } catch (error) {
    console.error("Error in connectNodes:", error);
    return false;
  }
}

function disconnectNodes(sourceConnector, destConnector) {
  try {
    const sourceNode = sourceConnector.source;
    const destTargets = Array.isArray(destConnector.target) ? destConnector.target : [destConnector.target];

    if (!sourceNode || !destTargets || destTargets.length === 0) return;

    const outputIndex = sourceConnector.port || 0;

    destTargets.forEach(destNode => {
      if (!destNode) return;
      const inputIndex = destConnector.inputIndex || 0;

      try {
        if (destNode instanceof AudioParam) {
          sourceNode.disconnect(destNode, outputIndex);
        } else {
          sourceNode.disconnect(destNode, outputIndex, inputIndex);
        }
      } catch (disconnectError) {
        console.warn("Disconnection error:", disconnectError);
      }
    });
  } catch (error) {
    console.error("Error in disconnectNodes:", error);
  }
}

// Patch Management Functions
function deleteSelection() {
    if (selectedConnection) {
        const conn = selectedConnection;
        if (conn.fromConnector.props.source && conn.toConnector.props.target) {
            disconnectNodes(conn.fromConnector.props, conn.toConnector.props);
        }
        connections = connections.filter(c => c !== conn);
        selectedConnection = null;
    } else if (selectedModules.length > 0) {
        const modulesToDelete = [...selectedModules];
        modulesToDelete.forEach(selectedModule => {
            if (selectedModule && !selectedModule.isPermanent) {
                connections = connections.filter(conn => {
                    const shouldRemove = conn.fromModule === selectedModule || conn.toModule === selectedModule;
                    if (shouldRemove) {
                        if (conn.fromConnector.props.source && conn.toConnector.props.target) {
                            disconnectNodes(conn.fromConnector.props, conn.toConnector.props);
                        }
                    }
                    return !shouldRemove;
                });

                try {
                    selectedModule.disconnect?.();
                } catch (disconnectError) {
                    console.error("Error disconnecting module:", disconnectError);
                }

                if (selectedModule.ui) {
                    selectedModule.ui.remove();
                }
                modules = modules.filter(m => m !== selectedModule);
            }
        });
        selectedModules = [];
    }
}

async function savePatch() {
  try {
    const patch = {
      modules: modules.map(m => m.getState ? m.getState() : {}),
      connections: connections.map(c => ({
        fromId: c.fromModule.id,
        fromConnector: c.fromConnector.name,
        toId: c.toModule.id,
        toConnector: c.toConnector.name,
      })).filter(c => c.fromId && c.toId)
    };
    const result = await window.electronAPI.savePatch(patch);
    if (result.success) {
      console.log('Patch guardado en:', result.path);
    } else if (result.error) {
      showError(`Error al guardar: ${result.error}`);
    }
  } catch (error) {
    console.error("Error saving patch:", error);
    showError("Error al guardar el patch");
  }
}

async function loadPatch() {
  try {
    const result = await window.electronAPI.loadPatch();
    if (result.success) {
      await reconstructPatch(result.data);
    } else if (result.error) {
      showError(`Error al cargar: ${result.error}`);
    }
  } catch (error) {
    console.error("Error loading patch:", error);
    showError("Error al cargar el patch");
  }
}

async function loadPatchFromFile(filePath) {
    try {
        const result = await window.electronAPI.loadPatchFromFile(filePath);
        if (result.success) {
            await reconstructPatch(result.data);
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error(`Error loading patch from ${filePath}:`, error);
        showError(`No se pudo cargar el patch: ${filePath}`);
    }
}

async function reconstructPatch(patchData) {
  try {
    // Clear existing modules
    modules.filter(m => !m.isPermanent).forEach(m => {
      try {
        m.disconnect?.();
        if (m.ui) m.ui.remove();
      } catch (error) {
        console.error(`Error disconnecting module ${m.id}:`, error);
      }
    });

    modules = modules.filter(m => m.isPermanent);
    connections = [];
    selectedModules = [];
    selectedConnection = null;

    // Load new modules
    const modulePromises = patchData.modules.map(async (moduleState) => {
      if (moduleState.isPermanent) {
          const existingModule = modules.find(m => m.id === moduleState.id);
          if (existingModule) {
            try {
              existingModule.setState?.(moduleState);
            } catch (error) {
              console.error(`Error setting state for module ${moduleState.id}:`, error);
            }
          }
          return null;
      }

      const ModuleClass = MODULE_CLASSES[moduleState.type];
      if (!ModuleClass) {
        console.warn(`Module type ${moduleState.type} not found`);
        return null;
      }

      try {
        const newModule = new ModuleClass(moduleState.x, moduleState.y, moduleState.id, moduleState);
        if (newModule.readyPromise) {
          await newModule.readyPromise.catch(error => {
            console.error(`Error initializing module ${moduleState.id}:`, error);
          });
        }
        return newModule;
      } catch (error) {
        console.error(`Error creating module ${moduleState.type}:`, error);
        return null;
      }
    });

    const loadedModules = (await Promise.all(modulePromises)).filter(m => m);
    modules.push(...loadedModules);

    // Create connections
    const moduleMap = new Map(modules.map(m => [m.id, m]));

    patchData.connections.forEach(connData => {
      try {
        const fromModule = moduleMap.get(connData.fromId);
        const toModule = moduleMap.get(connData.toId);
        if (!fromModule || !toModule) {
          console.warn(`Connection references missing modules: ${connData.fromId} -> ${connData.toId}`);
          return;
        }

        const fromConnector = fromModule.outputs?.[connData.fromConnector];
        const toConnector = toModule.inputs?.[connData.toConnector];
        if (!fromConnector || !toConnector) {
          console.warn(`Connection references missing connectors: ${connData.fromConnector} -> ${connData.toConnector}`);
          return;
        }

        if (fromConnector.source && toConnector.target) {
          const success = connectNodes(fromConnector, toConnector);
          if (!success) {
            console.warn(`Failed to connect nodes: ${connData.fromId}.${connData.fromConnector} -> ${connData.toId}.${connData.toConnector}`);
            return;
          }
        }

        connections.push({
          fromModule,
          toModule,
          fromConnector: { name: connData.fromConnector, props: fromConnector },
          toConnector: { name: connData.toConnector, props: toConnector },
          type: fromConnector.type
        });
      } catch (error) {
        console.error(`Error processing connection ${connData.fromId}.${connData.fromConnector} -> ${connData.toId}.${connData.toConnector}:`, error);
      }
    });
  } catch (error) {
    console.error("Error reconstructing patch:", error);
    throw error;
  }
}

// Interaction Functions
function getModuleAt(x, y) {
  return [...modules].reverse().find(m =>
    x >= m.x && x <= m.x + m.width &&
    y >= m.y && y <= m.y + m.height
  );
}

function getModuleAndConnectorAt(x, y) {
  for (const module of [...modules].reverse()) {
    try {
      const connector = module.getConnectorAt?.(x, y);
      if (connector) return { module, connector };
    } catch (error) {
      console.error(`Error getting connector for module ${module.id}:`, error);
    }
  }
  return null;
}

function getConnectionAt(x, y) {
  const threshold = 15 / view.zoom;

  for (const conn of connections) {
    try {
      const fromPos = getConnectorPosition(conn.fromModule, conn.fromConnector.props);
      const toPos = getConnectorPosition(conn.toModule, conn.toConnector.props);

      const dist = Math.sqrt(Math.pow(toPos.x - fromPos.x, 2) + Math.pow(toPos.y - fromPos.y, 2));
      const droop = Math.min(100, dist * 0.4);

      const cp1 = {
        x: fromPos.x + (conn.fromConnector.props.orientation === 'horizontal' ? droop : 0),
        y: fromPos.y + (conn.fromConnector.props.orientation === 'vertical' ? droop : 0)
      };
      const cp2 = {
        x: toPos.x - (conn.toConnector.props.orientation === 'horizontal' ? droop : 0),
        y: toPos.y + (conn.toConnector.props.orientation === 'vertical' ? droop : 0)
      };

      for (let t = 0.05; t <= 0.95; t += 0.05) {
        const tx = Math.pow(1-t, 3)*fromPos.x + 3*Math.pow(1-t,2)*t*cp1.x + 3*(1-t)*Math.pow(t,2)*cp2.x + Math.pow(t,3)*toPos.x;
        const ty = Math.pow(1-t, 3)*fromPos.y + 3*Math.pow(1-t,2)*t*cp1.y + 3*(1-t)*Math.pow(t,2)*cp2.y + Math.pow(t,3)*toPos.y;
        if (Math.sqrt(Math.pow(x - tx, 2) + Math.pow(y - ty, 2)) < threshold) return conn;
      }
    } catch (error) {
      console.error("Error checking connection hit:", error);
    }
  }
  return null;
}

async function addModule(type, x, y) {
  try {
    const ModuleClass = MODULE_CLASSES[type];
    if (!ModuleClass) {
      console.warn(`Module type ${type} not found`);
      return;
    }

    const newModule = new ModuleClass(x, y);
    if (newModule.readyPromise) {
      await newModule.readyPromise.catch(error => {
        console.error(`Error initializing module ${type}:`, error);
      });
    }
    modules.push(newModule);
    selectedModules = [newModule];

    if (type === 'AudioPlayer') {
      createAudioPlayerUI(newModule);
    }
  } catch (error) {
    console.error(`Error adding module ${type}:`, error);
    showError(`Error al añadir módulo ${type}`);
  }
}

function createAudioPlayerUI(module) {
  try {
    const template = document.getElementById('audio-player-template');
    if (!template) {
      console.warn("Audio player template not found");
      return;
    }

    const ui = template.content.cloneNode(true);
    const uiContainer = document.createElement('div');
    uiContainer.appendChild(ui);
    document.body.appendChild(uiContainer);

    module.ui = uiContainer.firstElementChild;
    module.ui.id = `audioplayer-ui-${module.id}`;

    const fileInput = module.ui.querySelector('.audio-file-input');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            console.log(`[Renderer] Attempting to call decodeAudioFile for module ${module.id} with path ${file.path}`);
            window.electronAPI.decodeAudioFile(file.path, module.id);
        }
      });
    }

    const playStopBtn = module.ui.querySelector('.play-stop-btn');
    if (playStopBtn) {
      playStopBtn.addEventListener('click', () => {
        try {
          if (module.isPlaying) {
            module.stop();
            playStopBtn.textContent = 'Play';
          } else {
            module.play();
            playStopBtn.textContent = 'Stop';
          }
        } catch (error) {
          console.error("Error toggling play/stop:", error);
          showError("Error al reproducir/detener audio");
        }
      });
    }

    // Update button text when audio is loaded or stopped externally
    module.onPlaybackStateChange = (isPlaying) => {
        if (isPlaying) {
            playStopBtn.textContent = 'Stop';
        } else {
            playStopBtn.textContent = 'Play';
        }
    };

    const loopCheckbox = module.ui.querySelector('.loop-checkbox');
    if (loopCheckbox) {
      loopCheckbox.addEventListener('change', (e) => {
        try {
          module.loop = e.target.checked;
          if (module.source) {
              module.source.loop = module.loop;
          }
        } catch (error) {
          console.error("Error setting loop:", error);
        }
      });
    }

    module.ui.addEventListener('mousedown', (e) => e.stopPropagation());
  } catch (error) {
    console.error("Error creating audio player UI:", error);
  }
}



// Event Handlers
function onMouseDown(e) {
  try {
    e.preventDefault();
    if (interactingModule) return;

    mousePos = { x: e.clientX, y: e.clientY };
    const worldPos = screenToWorld(mousePos.x, mousePos.y);

    if (e.button === 1 || e.altKey) {
      isPanning = true;
      canvas.classList.add('grabbing');
      return;
    }

    if (e.button === 0) {
      patchContextMenu.style.display = 'none';
      const connectorHit = getModuleAndConnectorAt(worldPos.x, worldPos.y);

      if (connectorHit && connectorHit.connector.type === 'output') {
        isPatching = true;
        patchStart = {
          x: connectorHit.module.x + connectorHit.connector.props.x,
          y: connectorHit.module.y + connectorHit.connector.props.y,
          module: connectorHit.module,
          connector: connectorHit.connector
        };
        return;
      }

      const moduleHit = getModuleAt(worldPos.x, worldPos.y);
      if (moduleHit) {
        const isSelected = selectedModules.includes(moduleHit);

        if (e.ctrlKey || e.metaKey) {
          if (isSelected) {
            selectedModules.splice(selectedModules.indexOf(moduleHit), 1); // deselect
          } else {
            selectedModules.push(moduleHit); // select
          }
        } else {
          if (!isSelected) {
            selectedModules = [moduleHit];
          }
          // If it is selected, we don't change the selection, allowing for drag.
        }

        selectedConnection = null;

        if (moduleHit.handleMouseDown?.(worldPos.x, worldPos.y)) {
          interactingModule = moduleHit;
          return;
        }

        if (moduleHit.checkInteraction?.(worldPos)) {
          interactingModule = moduleHit;
          return;
        }

        if (moduleHit.handleClick?.(worldPos.x, worldPos.y)) {
          interactingModule = moduleHit;
          return;
        }

        draggingModule = moduleHit; // This is the module we are holding
        dragOffset.x = worldPos.x - moduleHit.x;
        dragOffset.y = worldPos.y - moduleHit.y;
        return;
      }

      const connectionHit = getConnectionAt(worldPos.x, worldPos.y);
      if (connectionHit) {
        selectedConnection = connectionHit;
        selectedModules = [];
        return;
      }

      selectedModules = [];
      selectedConnection = null;
      isPanning = true;
      canvas.classList.add('grabbing');
    }
  } catch (error) {
    console.error("Error in mouse down handler:", error);
  }
}

function onMouseMove(e) {
  try {
    e.preventDefault();
    mousePos = { x: e.clientX, y: e.clientY };
    const worldPos = screenToWorld(mousePos.x, mousePos.y);

    const hit = getModuleAndConnectorAt(worldPos.x, worldPos.y);
    hoveredConnectorInfo = hit;
    canvas.style.cursor = hit ? 'pointer' : (isPanning ? 'grabbing' : 'grab');

    if (interactingModule?.handleMouseDrag?.(worldPos.x, worldPos.y)) {
      // El módulo está manejando el arrastre
    } else if (draggingModule) {
      const dx = (worldPos.x - dragOffset.x) - draggingModule.x;
      const dy = (worldPos.y - dragOffset.y) - draggingModule.y;

      if (selectedModules.includes(draggingModule)) {
        selectedModules.forEach(m => {
            m.x += dx;
            m.y += dy;
        });
      } else {
        draggingModule.x += dx;
        draggingModule.y += dy;
      }
    } else if (interactingModule?.handleDragInteraction) {
      interactingModule.handleDragInteraction(worldPos);
    } else if (isPanning) {
      view.x += e.movementX;
      view.y += e.movementY;
    }
  } catch (error) {
    console.error("Error in mouse move handler:", error);
  }
}

function onMouseUp(e) {
  try {
    e.preventDefault();
    canvas.classList.remove('grabbing');
    canvas.style.cursor = 'grab';

    if (interactingModule?.handleMouseUp?.()) {
      // El módulo ha manejado el evento
    } else if (interactingModule?.endInteraction) {
      interactingModule.endInteraction();
    }

    if (isPatching) {
      const worldPos = screenToWorld(mousePos.x, mousePos.y);
      const hit = getModuleAndConnectorAt(worldPos.x, worldPos.y);

      if (hit && hit.connector.type === 'input' && hit.module !== patchStart.module) {
        const success = connectNodes(patchStart.connector.props, hit.connector.props);
        if (success) {
          connections.push({
            fromModule: patchStart.module,
            fromConnector: patchStart.connector,
            toModule: hit.module,
            toConnector: hit.connector,
            type: patchStart.connector.props.type
          });
        }
      }
    }

    draggingModule = null;
    isPatching = false;
    patchStart = null;
    isPanning = false;
    interactingModule = null;
  } catch (error) {
    console.error("Error in mouse up handler:", error);
  }
}

function onContextMenu(e) {
  try {
    e.preventDefault();
    const worldPos = screenToWorld(e.clientX, e.clientY);
    const moduleHit = getModuleAt(worldPos.x, worldPos.y);

    if (moduleHit) {
      showModuleContextMenu(moduleHit, e.clientX, e.clientY);
    } else {
      contextMenu.style.left = `${e.clientX}px`;
      contextMenu.style.top = `${e.clientY}px`;
      contextMenu.style.display = 'block';
    }
  } catch (error) {
    console.error("Error in context menu handler:", error);
  }
}

function showModuleContextMenu(module, x, y) {
    patchContextMenu.innerHTML = ''; // Clear previous items
    patchContextMenu.style.left = `${x}px`;
    patchContextMenu.style.top = `${y}px`;
    patchContextMenu.style.display = 'block';

    // Add "Duplicate" option
    const duplicateItem = document.createElement('div');
    duplicateItem.className = 'context-menu-item';
    duplicateItem.textContent = 'Duplicar Módulo';
    duplicateItem.addEventListener('click', () => {
        const state = module.getState();
        addModule(state.type, state.x + 20, state.y + 20);
        patchContextMenu.style.display = 'none';
    });
    patchContextMenu.appendChild(duplicateItem);

    // Add "Delete" option
    if (!module.isPermanent) {
        const deleteItem = document.createElement('div');
        deleteItem.className = 'context-menu-item';
        deleteItem.textContent = 'Eliminar Módulo';
        deleteItem.addEventListener('click', () => {
            selectedModules = [module]; // Select the module to be deleted
            deleteSelection();
            patchContextMenu.style.display = 'none';
        });
        patchContextMenu.appendChild(deleteItem);
    }

    // Add "Bypass" option
    const bypassItem = document.createElement('div');
    bypassItem.className = 'context-menu-item';
    bypassItem.textContent = module.bypassed ? 'Activar Módulo' : 'Bypass Módulo';
    bypassItem.addEventListener('click', () => {
        if (typeof module.toggleBypass === 'function') {
            module.toggleBypass();
        }
        patchContextMenu.style.display = 'none';
    });
    patchContextMenu.appendChild(bypassItem);
}

function onKeyDown(e) {
  try {
    if (e.target.tagName === 'INPUT') return;

    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      deleteSelection();
    }

    const keyboardModule = modules.find(m => m instanceof Keyboard);
    if (keyboardModule) {
      keyboardModule.handleKeyDown(e.key.toLowerCase());
    }
  } catch (error) {
    console.error("Error in key down handler:", error);
  }
}

function onKeyUp(e) {
  try {
    if (e.target.tagName === 'INPUT') return;

    const keyboardModule = modules.find(m => m instanceof Keyboard);
    if (keyboardModule) {
      keyboardModule.handleKeyUp(e.key.toLowerCase());
    }
  } catch (error) {
    console.error("Error in key up handler:", error);
  }
}

function onWheel(e) {
  try {
    e.preventDefault();
    const worldPos = screenToWorld(e.clientX, e.clientY);
    const zoomAmount = e.deltaY < 0 ? 1.1 : 1/1.1;
    const newZoom = Math.max(view.minZoom, Math.min(view.maxZoom, view.zoom * zoomAmount));

    view.x = e.clientX - worldPos.x * newZoom;
    view.y = e.clientY - worldPos.y * newZoom;
    view.zoom = newZoom;
  } catch (error) {
    console.error("Error in wheel handler:", error);
  }
}

// Setup Function
async function setup() {
  console.log('[DEBUG] setup() function started');
  try {
    // Configure canvas
    console.log('[DEBUG] Resizing canvas...');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    console.log('[DEBUG] Canvas resized.');

    // Initialize AudioContext
    try {
      await initAudioContext();

      // Initialize AnalyserNode
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048; // You can adjust this value
      dataArray = new Uint8Array(analyser.frequencyBinCount);

      // Load essential worklets
      await Promise.all([
        loadWorklet('ADSR', './worklets/adsr-processor.js'),
        loadWorklet('Sequencer', './worklets/sequencer-processor.js'),
        loadWorklet('VCO', './worklets/vco-processor.js'),
        loadWorklet('PWM', './worklets/pwm-processor.js'),
        loadWorklet('Vocoder', './worklets/vocoder-processor.js'),
        loadWorklet('Math', './worklets/math-processor.js'),
        loadWorklet('RingMod', './worklets/ring-mod-processor.js'),
        loadWorklet('SampleAndHold', './worklets/sample-and-hold-processor.js'),
        loadWorklet('NoiseGenerator', './worklets/noise-generator-processor.js'),
        loadWorklet('Gate', './worklets/gate-processor.js')
      ]);
    } catch (error) {
      console.error('Error initializing audio:', error);
      showError("Audio no disponible. Algunas funciones pueden no trabajar.", 10000);
      // Continue in degraded mode
    }

    // Create main modules
    const keyboard = new Keyboard(canvas.width / 2 - 125, canvas.height - 150, 'keyboard-main');
    modules.push(keyboard);

    const outputModule = {
      id: 'output-main',
      x: canvas.width / 2 - 50, y: 50, width: 100, height: 80,
      isPermanent: true, type: 'Output',
      inputs: {
        'audio': {
          x: 0, y: 40, // Centrado verticalmente a la izquierda
          type: 'audio',
          get target() { return analyser; }, // Dynamic getter
          orientation: 'horizontal' // Cambiado para que la línea salga hacia la derecha
        }
      },
      outputs: {},
      draw: function(ctx, isSelected) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.fillStyle = '#1a1a1a';
        ctx.strokeStyle = isSelected ? '#aaffff' : '#888';
        ctx.lineWidth = 2;
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.strokeRect(0, 0, this.width, this.height);

        ctx.fillStyle = '#E0E0E0';
        const speakerX = this.width / 2;
        const speakerY = this.height / 2;
        ctx.beginPath();
        ctx.moveTo(speakerX - 20, speakerY - 15);
        ctx.lineTo(speakerX - 5, speakerY - 15);
        ctx.lineTo(speakerX + 10, speakerY - 25);
        ctx.lineTo(speakerX + 10, speakerY + 25);
        ctx.lineTo(speakerX - 5, speakerY + 15);
        ctx.lineTo(speakerX - 20, speakerY + 15);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = '#E0E0E0';
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(speakerX + 15, speakerY, 8 + i * 6, -Math.PI / 4, Math.PI / 4);
            ctx.stroke();
        }

        const connector = this.inputs.audio;
        ctx.beginPath();
        ctx.arc(connector.x, connector.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#4a90e2';
        ctx.fill();

        ctx.restore();
      },
      getConnectorAt: function(x, y) {
        for (const [name, props] of Object.entries(this.inputs)) {
          const dist = Math.sqrt(Math.pow(x - (this.x + props.x), 2) + Math.pow(y - (this.y + props.y), 2));
          if (dist < 9) return { name, type: 'input', props, module: this };
        }
        return null;
      },
      getState: function() {
        return {
          id: this.id,
          type: this.type,
          x: this.x,
          y: this.y,
          isPermanent: this.isPermanent
        };
      },
      setState: function(state) {
        this.x = state.x;
        this.y = state.y;
      }
    };
    modules.push(outputModule);

    // Connect analyser to destination
    analyser.connect(audioContext.destination);

    // Set up event listeners
    setupEventListeners();

    

    // Start drawing
    draw();

  } catch (error) {
    console.error('Error during setup:', error);
    showError("Error fatal al iniciar la aplicación. Por favor recarga la página.", 15000);
  }
}

function setupEventListeners() {
  canvas.addEventListener('mousedown', onMouseDown, { passive: false });
  canvas.addEventListener('mousemove', onMouseMove, { passive: false });
  canvas.addEventListener('mouseup', onMouseUp, { passive: false });
  canvas.addEventListener('contextmenu', onContextMenu, { passive: false });
  canvas.addEventListener('wheel', onWheel, { passive: false });

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  document.getElementById('save-patch-btn').addEventListener('click', savePatch);
  document.getElementById('load-patch-btn').addEventListener('click', loadPatch);

  document.querySelectorAll('#context-menu .context-menu-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      try {
        const moduleType = e.target.getAttribute('data-module');
        const worldPos = screenToWorld(
          parseFloat(contextMenu.style.left.slice(0, -2)),
          parseFloat(contextMenu.style.top.slice(0, -2))
        );
        await addModule(moduleType, worldPos.x, worldPos.y);
        contextMenu.style.display = 'none';
      } catch (error) {
        console.error("Error adding module from context menu:", error);
      }
    });
  });

  window.addEventListener('click', (e) => {
    if (!contextMenu.contains(e.target)) contextMenu.style.display = 'none';
    if (!patchContextMenu.contains(e.target)) patchContextMenu.style.display = 'none';
    if (!visualizerContextMenu.contains(e.target)) visualizerContextMenu.style.display = 'none';
  });

  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });

  window.electronAPI.onRequestLoadPatch(loadPatch);
  window.electronAPI.onRequestSavePatch(savePatch);

  const visualizerModule = document.getElementById('visualizer-module');
  const visualizerHeader = document.querySelector('#visualizer-module .module-header');
  
  visualizerHeader.addEventListener('mousedown', (e) => {
    isDraggingVisualizer = true;
    visualizerDragOffset.x = e.clientX - visualizerHeader.parentElement.offsetLeft;
    visualizerDragOffset.y = e.clientY - visualizerHeader.parentElement.offsetTop;
  });

  const visualizerResizeObserver = new ResizeObserver(() => {
    requestAnimationFrame(() => {
      if (visualizerCanvas.width !== visualizerCanvas.offsetWidth ||
          visualizerCanvas.height !== visualizerCanvas.offsetHeight) {
        visualizerCanvas.width = visualizerCanvas.offsetWidth;
        visualizerCanvas.height = visualizerCanvas.offsetHeight;
      }
    });
  });
  visualizerResizeObserver.observe(visualizerModule);

  visualizerModule.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    visualizerContextMenu.style.left = `${e.clientX}px`;
    visualizerContextMenu.style.top = `${e.clientY}px`;
    visualizerContextMenu.style.display = 'block';
  });

  document.querySelectorAll('#visualizer-context-menu .context-menu-item').forEach(item => {
    item.addEventListener('click', (e) => {
      currentVisualStyle = e.target.getAttribute('data-style');
      visualizerContextMenu.style.display = 'none';
    });
  });

  document.addEventListener('mousemove', (e) => {
    if (isDraggingVisualizer) {
      const visualizerModule = document.getElementById('visualizer-module');
      visualizerModule.style.left = `${e.clientX - visualizerDragOffset.x}px`;
      visualizerModule.style.top = `${e.clientY - visualizerDragOffset.y}px`;
      // Remove transform to prevent conflict with positioning
      visualizerModule.style.transform = 'none'; 
    }
  });

  document.addEventListener('mouseup', () => {
    isDraggingVisualizer = false;
  });

  window.electronAPI.onDecodeComplete((_event, { success, moduleId, decodedData, error }) => {
      console.log(`[Renderer] onDecodeComplete received for module ${moduleId}. Success: ${success}`);
      const targetModule = modules.find(m => m.id === moduleId);
      if (!targetModule) return;

      if (success) {
          try {
              targetModule.loadDecodedData(decodedData);
              window.electronAPI.logMessage(`AudioPlayer ${moduleId}: Buffer loaded successfully.`);
          } catch (e) {
              window.electronAPI.logMessage(`AudioPlayer ${moduleId}: Error reconstructing buffer: ${e.message}`);
              showError(`Error processing decoded audio: ${e.message}`);
          }
      } else {
          window.electronAPI.logMessage(`AudioPlayer ${moduleId}: Decode failed: ${error}`);
          showError(`Failed to decode audio: ${error}`);
      }
  });

  
}

// Start the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('[DEBUG] DOMContentLoaded event fired');
  setup().catch(error => {
    console.error("Fatal error during application startup:", error);
  });
});