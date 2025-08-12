// renderer.js
console.log('[DEBUG] renderer.js script started');
window.electronAPI.logMessage('[DEBUG] renderer.js script started');

import { audioContext, onAudioReady } from './modules/AudioContext.js';
import { Visualizer } from './modules/Visualizer.js';

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
import { Clock } from './modules/Clock.js';
import { Vocoder } from './modules/Vocoder.js';
import { MathModule } from './modules/Math.js';
import { NoiseGenerator } from './modules/NoiseGenerator.js';
import { Arpeggiator } from './modules/Arpeggiator.js';
import { Chorus } from './modules/Chorus.js';
import { Flanger } from './modules/Flanger.js';
import { Phaser } from './modules/Phaser.js';

const canvas = document.getElementById('synth-canvas');
const ctx = canvas.getContext('2d');
const contextMenu = document.getElementById('context-menu');
const patchContextMenu = document.getElementById('patch-context-menu');
const visualizerContextMenu = document.getElementById('visualizer-context-menu');
const errorMessage = document.getElementById('error-message');

const MODULE_CLASSES = {
  VCO, VCF, ADSR, VCA, LFO, Mixer, RingMod,
  SampleAndHold, Sequencer, Osciloscopio, Delay,
  Compressor, Reverb, Keyboard, Math: MathModule,
  Microphone, AudioPlayer, Vocoder, NoiseGenerator,
  Arpeggiator, Clock, Chorus, Flanger, Phaser
};

window.setActiveTextInputModule = (module) => {
  activeTextInputModule = module;
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
let activeTextInputModule = null;
let isDraggingVisualizer = false;
let visualizerDragOffset = { x: 0, y: 0 };

let analyser = null;
let visualizer = null;
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let mediaStreamDestination;
let masterGain;
let recordGain;
let inputGain;
let postCompressorGain;


const view = { x: 0, y: 0, zoom: 1, minZoom: 0.2, maxZoom: 2.0 };
const CABLE_COLORS = { audio: '#f0a048', cv: '#ff80ab', gate: '#ff80ab' };

function screenToWorld(x, y) { return { x: (x - view.x) / view.zoom, y: (y - view.y) / view.zoom }; }
function showError(message, duration = 5000) { errorMessage.textContent = message; errorMessage.style.display = 'block'; setTimeout(() => errorMessage.style.display = 'none', duration); }
async function loadWorklet(workletName, workletPath) { try { await audioContext.audioWorklet.addModule(workletPath); console.log(`${workletName} worklet loaded successfully`); } catch (error) { console.error(`Failed to load ${workletName} worklet:`, error); showError(`Error loading ${workletName} module.`); } }
async function initAudioContext() { return new Promise((resolve) => { onAudioReady(() => { console.log('AudioContext ready for use'); resolve(); }); }); }

function draw() {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  if (visualizer) {
    visualizer.draw(analyser);
  }

  ctx.save();
  ctx.translate(view.x, view.y);
  ctx.scale(view.zoom, view.zoom);
  drawGrid();
  drawConnections();
  if (isPatching) drawActivePatch();
  drawModules();
  ctx.restore();
  
  requestAnimationFrame(draw);
}

function drawGrid() {
  const gridSize = 20 * view.zoom;
  const offsetX = view.x % gridSize;
  const offsetY = view.y % gridSize;
  ctx.fillStyle = '#3c3c3c';
  ctx.fillRect(-view.x / view.zoom, -view.y / view.zoom, canvas.width / view.zoom, canvas.height / view.zoom);
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
    const dist = Math.hypot(toPos.x - fromPos.x, toPos.y - fromPos.y);
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
  const dist = Math.hypot(worldMouse.x - fromPos.x, worldMouse.y - fromPos.y);
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
  return { x: module.x + connector.x, y: module.y + connector.y };
}

function connectNodes(sourceConnector, destConnector) {
  try {
    const sourceNode = sourceConnector.source;
    if (!sourceNode) {
      console.error("Invalid source node for connection");
      return;
    }
    if (destConnector.onConnect && typeof destConnector.onConnect === 'function') {
      destConnector.onConnect(sourceNode);
    }
    const destTargets = Array.isArray(destConnector.target) ? destConnector.target : [destConnector.target];
    const validDestTargets = destTargets.filter(node => node != null);
    if (validDestTargets.length > 0) {
        const outputIndex = sourceConnector.port || 0;
        validDestTargets.forEach(destNode => {
            const inputIndex = destConnector.inputIndex || 0;
            if (destNode instanceof AudioParam) {
                sourceNode.connect(destNode, outputIndex);
            } else {
                sourceNode.connect(destNode, outputIndex, inputIndex);
            }
        });
    }
  } catch (error) {
    console.error("Error in connectNodes:", error);
  }
}

function disconnectNodes(sourceConnector, destConnector) {
  try {
    const sourceNode = sourceConnector.source;
    if (!sourceNode) return;
    if (destConnector.onDisconnect && typeof destConnector.onDisconnect === 'function') {
      destConnector.onDisconnect(sourceNode);
    }
    const destTargets = Array.isArray(destConnector.target) ? destConnector.target : [destConnector.target];
    const validDestTargets = destTargets.filter(node => node != null);
    if (validDestTargets.length > 0) {
        const outputIndex = sourceConnector.port || 0;
        validDestTargets.forEach(destNode => {
            const inputIndex = destConnector.inputIndex || 0;
            try {
                if (destNode instanceof AudioParam) {
                    sourceNode.disconnect(destNode, outputIndex);
                } else {
                    sourceNode.disconnect(destNode, outputIndex, inputIndex);
                }
            } catch (e) { /* Ignorar errores si la conexión no existía */ }
        });
    }
  } catch (error) {
    console.error("Error in disconnectNodes:", error);
  }
}

function deleteSelection() {
  if (selectedConnection) {
    disconnectNodes(selectedConnection.fromConnector.props, selectedConnection.toConnector.props);
    connections = connections.filter(c => c !== selectedConnection);
    selectedConnection = null;
  } else if (selectedModules.length > 0) {
    selectedModules.forEach(selectedModule => {
      if (selectedModule && !selectedModule.isPermanent) {
        connections = connections.filter(conn => {
          const shouldRemove = conn.fromModule === selectedModule || conn.toModule === selectedModule;
          if (shouldRemove) {
            disconnectNodes(conn.fromConnector.props, conn.toConnector.props);
          }
          return !shouldRemove;
        });
        selectedModule.disconnect?.();
        if (selectedModule.ui) selectedModule.ui.remove();
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
    if (result.success) console.log('Patch guardado en:', result.path);
    else if (result.error) showError(`Error al guardar: ${result.error}`);
  } catch (error) {
    showError("Error al guardar el patch");
  }
}

async function loadPatch() {
  try {
    const result = await window.electronAPI.loadPatch();
    if (result.success) await reconstructPatch(result.data);
    else if (result.error) showError(`Error al cargar: ${result.error}`);
  } catch (error) {
    showError("Error al cargar el patch");
  }
}

async function reconstructPatch(patchData) {
  try {
    modules.filter(m => !m.isPermanent).forEach(m => { m.disconnect?.(); if (m.ui) m.ui.remove(); });
    modules = modules.filter(m => m.isPermanent);
    connections = [];
    selectedModules = [];
    selectedConnection = null;
    const modulePromises = patchData.modules.map(async (moduleState) => {
      if (moduleState.isPermanent) {
        const existingModule = modules.find(m => m.id === moduleState.id);
        if (existingModule) existingModule.setState?.(moduleState);
        return null;
      }
      const ModuleClass = MODULE_CLASSES[moduleState.type];
      if (!ModuleClass) return null;
      const newModule = new ModuleClass(moduleState.x, moduleState.y, moduleState.id, moduleState);
      if (newModule.readyPromise) await newModule.readyPromise;
      return newModule;
    });
    const loadedModules = (await Promise.all(modulePromises)).filter(Boolean);
    modules.push(...loadedModules);
    const moduleMap = new Map(modules.map(m => [m.id, m]));
    patchData.connections.forEach(connData => {
      const fromModule = moduleMap.get(connData.fromId);
      const toModule = moduleMap.get(connData.toId);
      if (!fromModule || !toModule) return;
      const fromConnector = fromModule.outputs?.[connData.fromConnector];
      const toConnector = toModule.inputs?.[connData.toConnector];
      if (!fromConnector || !toConnector) return;
      connectNodes(fromConnector, toConnector);
      connections.push({ fromModule, toModule, fromConnector: { name: connData.fromConnector, props: fromConnector }, toConnector: { name: connData.toConnector, props: toConnector }, type: fromConnector.type });
    });
  } catch (error) {
    console.error("Error reconstructing patch:", error);
  }
}

async function loadTemplatePatch(templateName) {
    try {
        const result = await window.electronAPI.loadPatchFromFile(templateName);
        if (result.success) await reconstructPatch(result.data);
        else showError(`Error al cargar la plantilla: ${result.error}`);
    } catch (error) {
        showError(`No se pudo cargar la plantilla: ${templateName}`);
    }
}

function getModuleAt(x, y) {
  return [...modules].reverse().find(m => x >= m.x && x <= m.x + m.width && y >= m.y && y <= m.y + m.height);
}

function getModuleAndConnectorAt(x, y) {
  for (const module of [...modules].reverse()) {
    const connector = module.getConnectorAt?.(x, y);
    if (connector) return { module, connector };
  }
  return null;
}

function getConnectionAt(x, y) {
  const threshold = 15 / view.zoom;
  for (const conn of connections) {
    const fromPos = getConnectorPosition(conn.fromModule, conn.fromConnector.props);
    const toPos = getConnectorPosition(conn.toModule, conn.toConnector.props);
    const dist = Math.hypot(toPos.x - fromPos.x, toPos.y - fromPos.y);
    const droop = Math.min(100, dist * 0.4);
    const cp1 = { x: fromPos.x + (conn.fromConnector.props.orientation === 'horizontal' ? droop : 0), y: fromPos.y + (conn.fromConnector.props.orientation === 'vertical' ? droop : 0) };
    const cp2 = { x: toPos.x - (conn.toConnector.props.orientation === 'horizontal' ? droop : 0), y: toPos.y + (conn.toConnector.props.orientation === 'vertical' ? droop : 0) };
    for (let t = 0.05; t <= 0.95; t += 0.05) {
      const tx = Math.pow(1-t, 3)*fromPos.x + 3*Math.pow(1-t,2)*t*cp1.x + 3*(1-t)*Math.pow(t,2)*cp2.x + Math.pow(t,3)*toPos.x;
      const ty = Math.pow(1-t, 3)*fromPos.y + 3*Math.pow(1-t,2)*t*cp1.y + 3*(1-t)*Math.pow(t,2)*cp2.y + Math.pow(t,3)*toPos.y;
      if (Math.hypot(x - tx, y - ty) < threshold) return conn;
    }
  }
  return null;
}

async function addModule(type, x, y) {
  if (type === 'Visualizer') {
    const visualizerModule = document.getElementById('visualizer-module');
    visualizerModule.style.display = 'block';
    visualizer = new Visualizer('visualizer-canvas');
    return;
  }
  const ModuleClass = MODULE_CLASSES[type];
  if (!ModuleClass) return;
  const newModule = new ModuleClass(x, y);
  if (newModule.readyPromise) await newModule.readyPromise;
  modules.push(newModule);
  selectedModules = [newModule];
  if (type === 'AudioPlayer') createAudioPlayerUI(newModule);
}

function toggleRecording() {
    if (isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        console.log('Recording stopped.');
    } else {
        mediaRecorder.start();
        isRecording = true;
        console.log('Recording started.');
    }
}

async function handleLoadAudioForPlayer(audioPlayerModule) {
  try {
    const result = await window.electronAPI.openAudioFileDialog();
    if (result.success && result.filePath) {
      showError('Decodificando audio...', 3000);
      // ***** CORRECCIÓN APLICADA: No se necesita 'await' aquí ya que la respuesta viene por un evento *****
      window.electronAPI.decodeAudioFile(result.filePath, audioPlayerModule.id);
    } else if (result.error) {
      showError(`Error al abrir archivo: ${result.error}`, 5000);
    }
  } catch (error) {
    console.error('Error al cargar archivo de audio:', error);
    showError('Error al cargar archivo de audio.', 5000);
  }
}

function createAudioPlayerUI(audioPlayerModule) {
  const uiContainer = document.createElement('div');
  uiContainer.className = 'audio-player-ui';
  uiContainer.style.position = 'absolute';
  uiContainer.style.background = '#333';
  uiContainer.style.border = '1px solid #555';
  uiContainer.style.padding = '10px';
  uiContainer.style.borderRadius = '5px';
  uiContainer.style.color = '#eee';
  uiContainer.style.width = '180px';
  uiContainer.style.height = '60px';
  uiContainer.style.display = 'none'; // Hidden by default, managed by updateModuleUI

  const playStopButton = document.createElement('button');
  playStopButton.textContent = audioPlayerModule.isPlaying ? 'Stop' : 'Play';
  playStopButton.style.width = '80px';
  playStopButton.style.height = '30px';
  playStopButton.style.marginRight = '10px';
  playStopButton.onclick = () => {
    if (audioPlayerModule.isPlaying) {
      audioPlayerModule.stop();
    } else {
      audioPlayerModule.play();
    }
    playStopButton.textContent = audioPlayerModule.isPlaying ? 'Stop' : 'Play';
  };
  uiContainer.appendChild(playStopButton);

  const loopToggleButton = document.createElement('button');
  loopToggleButton.textContent = audioPlayerModule.loop ? 'Loop ON' : 'Loop OFF';
  loopToggleButton.style.width = '80px';
  loopToggleButton.style.height = '30px';
  loopToggleButton.onclick = () => {
    audioPlayerModule.loop = !audioPlayerModule.loop;
    if (audioPlayerModule.source) {
      audioPlayerModule.source.loop = audioPlayerModule.loop;
    }
    loopToggleButton.textContent = audioPlayerModule.loop ? 'Loop ON' : 'Loop OFF';
  };
  uiContainer.appendChild(loopToggleButton);

  // Update button text when playback state changes from module
  audioPlayerModule.onPlaybackStateChange = (isPlaying) => {
    playStopButton.textContent = isPlaying ? 'Stop' : 'Play';
  };

  document.body.appendChild(uiContainer);
  audioPlayerModule.ui = uiContainer; // Attach UI element to module for easy access
}


function onMouseDown(e) {
  e.preventDefault();
  if (activeTextInputModule && !getModuleAt(screenToWorld(e.clientX, e.clientY).x, screenToWorld(e.clientX, e.clientY).y) === activeTextInputModule) {
    activeTextInputModule.handleKey('Enter');
  }
  if (interactingModule) return;
  mousePos = { x: e.clientX, y: e.clientY };
  const worldPos = screenToWorld(mousePos.x, mousePos.y);
  if (e.button === 1 || e.altKey) { isPanning = true; canvas.classList.add('grabbing'); return; }
  if (e.button === 0) {
    patchContextMenu.style.display = 'none';
    const connectorHit = getModuleAndConnectorAt(worldPos.x, worldPos.y);
    if (connectorHit && connectorHit.connector.type === 'output') {
      isPatching = true;
      patchStart = { x: connectorHit.module.x + connectorHit.connector.props.x, y: connectorHit.module.y + connectorHit.connector.props.y, module: connectorHit.module, connector: connectorHit.connector };
      return;
    }
    const moduleHit = getModuleAt(worldPos.x, worldPos.y);
    if (moduleHit) {
      const isSelected = selectedModules.includes(moduleHit);
      if (e.ctrlKey || e.metaKey) {
        if (isSelected) selectedModules.splice(selectedModules.indexOf(moduleHit), 1);
        else selectedModules.push(moduleHit);
      } else if (!isSelected) {
        selectedModules = [moduleHit];
      }
      selectedConnection = null;
      if (moduleHit.handleMouseDown?.(worldPos.x, worldPos.y) || moduleHit.checkInteraction?.(worldPos) || moduleHit.handleClick?.(worldPos.x, worldPos.y)) {
        interactingModule = moduleHit;
        return;
      }
      draggingModule = moduleHit;
      dragOffset.x = worldPos.x - moduleHit.x;
      dragOffset.y = worldPos.y - moduleHit.y;
      return;
    }
    const connectionHit = getConnectionAt(worldPos.x, worldPos.y);
    if (connectionHit) { selectedConnection = connectionHit; selectedModules = []; return; }
    selectedModules = [];
    selectedConnection = null;
    isPanning = true;
    canvas.classList.add('grabbing');
  }
}

function onMouseMove(e) {
  e.preventDefault();
  mousePos = { x: e.clientX, y: e.clientY };
  const worldPos = screenToWorld(mousePos.x, mousePos.y);
  const hit = getModuleAndConnectorAt(worldPos.x, worldPos.y);
  hoveredConnectorInfo = hit;
  canvas.style.cursor = hit ? 'pointer' : (isPanning ? 'grabbing' : 'grab');
  if (interactingModule?.handleMouseDrag?.(worldPos.x, worldPos.y) || interactingModule?.handleDragInteraction?.(worldPos)) return; 
  else if (draggingModule) {
    const dx = (worldPos.x - dragOffset.x) - draggingModule.x;
    const dy = (worldPos.y - dragOffset.y) - draggingModule.y;
    if (selectedModules.includes(draggingModule)) {
      selectedModules.forEach(m => { m.x += dx; m.y += dy; });
    } else {
      draggingModule.x += dx;
      draggingModule.y += dy;
    }
  } else if (isPanning) {
    view.x += e.movementX;
    view.y += e.movementY;
  }
}

function onMouseUp(e) {
  e.preventDefault();
  canvas.classList.remove('grabbing');
  canvas.style.cursor = 'grab';
  interactingModule?.handleMouseUp?.();
  interactingModule?.endInteraction?.();
  if (isPatching) {
    const worldPos = screenToWorld(mousePos.x, mousePos.y);
    const hit = getModuleAndConnectorAt(worldPos.x, worldPos.y);
    if (hit && hit.connector.type === 'input' && hit.module !== patchStart.module) {
      connectNodes(patchStart.connector.props, hit.connector.props);
      connections.push({ fromModule: patchStart.module, fromConnector: patchStart.connector, toModule: hit.module, toConnector: hit.connector, type: patchStart.connector.props.type });
    }
  }
  draggingModule = null;
  isPatching = false;
  patchStart = null;
  isPanning = false;
  interactingModule = null;
}

function onContextMenu(e) {
  e.preventDefault();
  const worldPos = screenToWorld(e.clientX, e.clientY);
  const moduleHit = getModuleAt(worldPos.x, worldPos.y);

  if (moduleHit) {
    const interaction = moduleHit.checkInteraction ? moduleHit.checkInteraction(worldPos) : 'module';
    showModuleContextMenu(moduleHit, e.clientX, e.clientY, interaction);
  } else {
    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.top = `${e.clientY}px`;
    contextMenu.style.display = 'block';
  }
}

function showModuleContextMenu(module, x, y, interaction) {
  patchContextMenu.innerHTML = '';
  patchContextMenu.style.left = `${x}px`;
  patchContextMenu.style.top = `${y}px`;
  patchContextMenu.style.display = 'block';

  if (module.id === 'output-main' && interaction === 'speaker') {
    const recordItem = document.createElement('div');
    recordItem.className = 'context-menu-item';
    recordItem.textContent = isRecording ? 'Detener Grabación' : 'Iniciar Grabación';
    recordItem.onclick = () => {
      toggleRecording();
      patchContextMenu.style.display = 'none';
    };
    patchContextMenu.appendChild(recordItem);
  } else if (module.type === 'AudioPlayer') {
    const loadAudioItem = document.createElement('div');
    loadAudioItem.className = 'context-menu-item';
    loadAudioItem.textContent = 'Cargar Audio';
    loadAudioItem.onclick = async () => {
      await handleLoadAudioForPlayer(module);
      patchContextMenu.style.display = 'none';
    };
    patchContextMenu.appendChild(loadAudioItem);

    const playStopItem = document.createElement('div');
    playStopItem.className = 'context-menu-item';
    playStopItem.textContent = module.isPlaying ? 'Detener' : 'Reproducir';
    playStopItem.onclick = () => {
      if (module.isPlaying) {
        module.stop();
      } else {
        module.play();
      }
      patchContextMenu.style.display = 'none';
    };
    patchContextMenu.appendChild(playStopItem);

    const loopToggleItem = document.createElement('div');
    loopToggleItem.className = 'context-menu-item';
    loopToggleItem.textContent = module.loop ? 'Desactivar Loop' : 'Activar Loop';
    loopToggleItem.onclick = () => {
      module.loop = !module.loop;
      if (module.source) { // Update the loop property on the current source if it exists
        module.source.loop = module.loop;
      }
      patchContextMenu.style.display = 'none';
    };
    patchContextMenu.appendChild(loopToggleItem);
  }

  const duplicateItem = document.createElement('div');
  duplicateItem.className = 'context-menu-item';
  duplicateItem.textContent = 'Duplicar Módulo';
  duplicateItem.onclick = () => { const state = module.getState(); addModule(state.type, state.x + 20, state.y + 20); patchContextMenu.style.display = 'none'; };
  patchContextMenu.appendChild(duplicateItem);

  if (!module.isPermanent) {
    const deleteItem = document.createElement('div');
    deleteItem.className = 'context-menu-item';
    deleteItem.textContent = 'Eliminar Módulo';
    deleteItem.onclick = () => { selectedModules = [module]; deleteSelection(); patchContextMenu.style.display = 'none'; };
    patchContextMenu.appendChild(deleteItem);
  }
  if (typeof module.toggleBypass === 'function') {
    const bypassItem = document.createElement('div');
    bypassItem.className = 'context-menu-item';
    bypassItem.textContent = module.bypassed ? 'Activar Módulo' : 'Bypass Módulo';
    bypassItem.onclick = () => { module.toggleBypass(); patchContextMenu.style.display = 'none'; };
    patchContextMenu.appendChild(bypassItem);
  }
}

function onKeyDown(e) {
  if (activeTextInputModule) {
    activeTextInputModule.handleKey(e.key);
    e.preventDefault();
    return;
  }
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    deleteSelection();
  }
  const keyboardModule = modules.find(m => m instanceof Keyboard);
  if (keyboardModule) keyboardModule.handleKeyDown(e.key.toLowerCase());
}

function onKeyUp(e) {
  if (activeTextInputModule) { e.preventDefault(); return; }
  if (e.target.tagName === 'INPUT') return;
  const keyboardModule = modules.find(m => m instanceof Keyboard);
  if (keyboardModule) keyboardModule.handleKeyUp(e.key.toLowerCase());
}

function onWheel(e) {
  e.preventDefault();
  const worldPos = screenToWorld(e.clientX, e.clientY);
  const zoomAmount = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  const newZoom = Math.max(view.minZoom, Math.min(view.maxZoom, view.zoom * zoomAmount));
  view.x = e.clientX - worldPos.x * newZoom;
  view.y = e.clientY - worldPos.y * newZoom;
  view.zoom = newZoom;
}

async function setup() {
  console.log('[DEBUG] setup() function started');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  await initAudioContext();
  
  inputGain = audioContext.createGain();
  masterGain = audioContext.createGain();
  recordGain = audioContext.createGain();
  postCompressorGain = audioContext.createGain();
  
  masterGain.gain.value = 1.5;
  recordGain.gain.value = 2.0;
  postCompressorGain.gain.value = 1.5;

  analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  mediaStreamDestination = audioContext.createMediaStreamDestination();

  // Ruta de audio principal
  inputGain.connect(masterGain);
  inputGain.connect(recordGain);

  // Ruta para escuchar (altavoces)
  masterGain.connect(analyser);
  analyser.connect(audioContext.destination);

  // Ruta para grabar
  const compressorNode = audioContext.createDynamicsCompressor();
  compressorNode.threshold.value = -20; // dB
  compressorNode.knee.value = 30; // dB
  compressorNode.ratio.value = 4; // 4:1
  compressorNode.attack.value = 0.01; // seconds
  compressorNode.release.value = 0.5; // seconds

  recordGain.connect(compressorNode);
  compressorNode.connect(postCompressorGain);
  postCompressorGain.connect(mediaStreamDestination);

  mediaRecorder = new MediaRecorder(mediaStreamDestination.stream);
  mediaRecorder.ondataavailable = event => {
      audioChunks.push(event.data);
  };
  mediaRecorder.onstop = () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      audioChunks = [];
      const reader = new FileReader();
      reader.onload = () => {
          const buffer = reader.result;
          window.electronAPI.saveRecording(buffer);
      };
      reader.readAsArrayBuffer(audioBlob);
  };


  document.getElementById('visualizer-module').style.display = 'none';

  const workletsToLoad = [
    { name: 'ADSR', path: './worklets/adsr-processor.js' }, { name: 'Arpeggiator', path: './worklets/arpeggiator-processor.js' },
    { name: 'Clock', path: './worklets/clock-processor.js' }, { name: 'Gate', path: './worklets/gate-processor.js' },
    { name: 'LFO', path: './worklets/lfo-processor.js' }, { name: 'Math', path: './worklets/math-processor.js' },
    { name: 'NoiseGenerator', path: './worklets/noise-generator-processor.js' }, { name: 'PWM', path: './worklets/pwm-processor.js' },
    { name: 'RingMod', path: './worklets/ring-mod-processor.js' }, { name: 'SampleAndHold', path: './worklets/sample-and-hold-processor.js' },
    { name: 'Sequencer', path: './worklets/sequencer-processor.js' }, { name: 'VCO', path: './worklets/vco-processor.js' },
    { name: 'Vocoder', path: './worklets/vocoder-processor.js' }, { name: 'Chorus', path: './worklets/chorus-processor.js' },
    { name: 'Flanger', path: './worklets/flanger-processor.js' }, { name: 'Phaser', path: './worklets/phaser-processor.js' }
  ];

  await Promise.all(workletsToLoad.map(w => loadWorklet(w.name, w.path)));
  
  const keyboard = new Keyboard(canvas.width / 2 - 125, canvas.height - 150, 'keyboard-main');
  modules.push(keyboard);
  
  const outputModule = {
    id: 'output-main', x: canvas.width / 2 - 50, y: 50, width: 100, height: 80, isPermanent: true, type: 'Output',
    inputs: { 'audio': { x: 0, y: 40, type: 'audio', get target() { return inputGain; }, orientation: 'horizontal' } },
    outputs: {},
    draw: function(ctx, isSelected) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.fillStyle = isRecording ? '#ff4d4d' : '#1a1a1a';
      ctx.strokeStyle = isSelected ? '#aaffff' : '#888';
      ctx.lineWidth = 2;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.strokeRect(0, 0, this.width, this.height);
      ctx.fillStyle = '#E0E0E0';
      const speakerX = this.width / 2, speakerY = this.height / 2;
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
        if (Math.hypot(x - (this.x + props.x), y - (this.y + props.y)) < 9)
          return { name, type: 'input', props, module: this };
      }
      return null;
    },
    checkInteraction: function(worldPos) {
      const localX = worldPos.x - this.x;
      const localY = worldPos.y - this.y;
      const speakerX = this.width / 2;
      const speakerY = this.height / 2;
      if (localX > speakerX - 25 && localX < speakerX + 25 && localY > speakerY - 25 && localY < speakerY + 25) {
        return 'speaker';
      }
      return 'module';
    },
    getState: function() { return { id: this.id, type: this.type, x: this.x, y: this.y, isPermanent: this.isPermanent }; },
    setState: function(state) { this.x = state.x; this.y = state.y; }
  };
  modules.push(outputModule);
  setupEventListeners();
  draw();
}

function setupEventListeners() {
  canvas.addEventListener('mousedown', onMouseDown, { passive: false });
  canvas.addEventListener('mousemove', onMouseMove, { passive: false });
  canvas.addEventListener('mouseup', onMouseUp, { passive: false });
  canvas.addEventListener('contextmenu', onContextMenu, { passive: false });
  canvas.addEventListener('wheel', onWheel, { passive: false });
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  document.querySelectorAll('#context-menu .context-menu-item').forEach(item => {
    if (item.classList.contains('context-menu-has-submenu')) {
      item.addEventListener('mouseenter', () => {
          const submenu = item.querySelector('.context-submenu');
          if (submenu) { submenu.style.display = 'block'; }
      });
      item.addEventListener('mouseleave', () => {
          const submenu = item.querySelector('.context-submenu');
          if (submenu) { submenu.style.display = 'none'; }
      });
    }
    item.addEventListener('click', async (e) => {
      if (e.currentTarget.classList.contains('context-menu-has-submenu')) { e.stopPropagation(); return; }
      const moduleType = e.currentTarget.getAttribute('data-module');
      if (moduleType) {
        const worldPos = screenToWorld(parseFloat(contextMenu.style.left), parseFloat(contextMenu.style.top));
        await addModule(moduleType, worldPos.x, worldPos.y);
      }
      contextMenu.style.display = 'none';
      document.querySelectorAll('.context-submenu').forEach(sub => sub.style.display = 'none');
    });
  });

  window.addEventListener('click', (e) => {
    if (!contextMenu.contains(e.target)) { contextMenu.style.display = 'none'; document.querySelectorAll('.context-submenu').forEach(sub => sub.style.display = 'none'); }
    if (!patchContextMenu.contains(e.target)) patchContextMenu.style.display = 'none';
    if (!visualizerContextMenu.contains(e.target)) visualizerContextMenu.style.display = 'none';
  });
  window.addEventListener('resize', () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; });
  window.electronAPI.onRequestLoadPatch(loadPatch);
  window.electronAPI.onRequestSavePatch(savePatch);
  window.electronAPI.onLoadTemplatePatch(loadTemplatePatch);

  // ***** CORRECCIÓN APLICADA: Lógica de manejo de decodificación refactorizada *****
  window.electronAPI.onDecodeComplete((result) => {
    if (result.success) {
        const module = modules.find(m => m.id === result.moduleId);
        if (!module) {
            console.error('Módulo no encontrado para el ID:', result.moduleId);
            showError('Error: Módulo no encontrado.', 5000);
            return;
        }

        if (typeof module.loadDecodedData !== 'function') {
            console.error(`Módulo ${module.type} (ID: ${result.moduleId}) no tiene un método loadDecodedData.`);
            showError(`Error: Módulo ${module.type} no puede cargar audio.`, 5000);
            return;
        }

        try {
            if (module.type === 'AudioPlayer') {
                const audioBuffer = audioContext.createBuffer(
                    result.decodedData.numberOfChannels,
                    result.decodedData.length,
                    result.decodedData.sampleRate
                );
                for (let i = 0; i < result.decodedData.numberOfChannels; i++) {
                    audioBuffer.copyToChannel(new Float32Array(result.decodedData.channelData[i]), i);
                }
                module.loadDecodedData(audioBuffer);
            } else if (module.type === 'GranularSampler') {
                const decodedDataForSampler = { ...result.decodedData };
                decodedDataForSampler.channelData = decodedDataForSampler.channelData.map(ch => new Float32Array(ch));
                module.loadDecodedData(decodedDataForSampler);
            }
            showError('Audio cargado y decodificado correctamente.', 3000);
        } catch (e) {
            console.error(`Error procesando datos decodificados para el módulo ${module.id}:`, e);
            showError('Error al procesar datos de audio.', 5000);
        }
    } else {
        console.error('Error de decodificación:', result.error);
        showError(`Error al decodificar audio: ${result.error}`, 5000);
    }
  });
  
  const visualizerModule = document.getElementById('visualizer-module');
  const visualizerHeader = document.querySelector('#visualizer-module .module-header');
  visualizerHeader.addEventListener('mousedown', (e) => {
    isDraggingVisualizer = true;
    visualizerDragOffset.x = e.clientX - visualizerModule.offsetLeft;
    visualizerDragOffset.y = e.clientY - visualizerModule.offsetTop;
  });
  document.addEventListener('mousemove', (e) => { if (isDraggingVisualizer) { visualizerModule.style.left = `${e.clientX - visualizerDragOffset.x}px`; visualizerModule.style.top = `${e.clientY - visualizerDragOffset.y}px`; } });
  document.addEventListener('mouseup', () => { isDraggingVisualizer = false; });
  
  visualizerModule.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    visualizerContextMenu.style.left = `${e.clientX}px`;
    visualizerContextMenu.style.top = `${e.clientY}px`;
    visualizerContextMenu.style.display = 'block';
  });

  document.querySelectorAll('#visualizer-context-menu .context-menu-item').forEach(item => {
    item.addEventListener('click', (e) => {
      const styleName = e.target.getAttribute('data-style');
      if (styleName === 'hide') {
        document.getElementById('visualizer-module').style.display = 'none';
        visualizer = null;
      } else if (visualizer && styleName) {
        visualizer.setStyle(styleName);
      }
      visualizerContextMenu.style.display = 'none';
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('[DEBUG] DOMContentLoaded event fired');
  setup().catch(error => {
    console.error("Fatal error during application startup:", error);
  });
});