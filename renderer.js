// renderer.js
import { audioContext } from './modules/AudioContext.js';
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

const { dialog } = require('@electron/remote');
const fs = require('fs');

const canvas = document.getElementById('synth-canvas');
const ctx = canvas.getContext('2d');
const contextMenu = document.getElementById('context-menu');
const patchContextMenu = document.getElementById('patch-context-menu');

const MODULE_CLASSES = { 
  VCO, VCF, ADSR, VCA, LFO, Mixer, RingMod, 
  SampleAndHold, Sequencer, Osciloscopio, Delay, 
  Compressor, Reverb, Keyboard 
};

let modules = [];
let connections = [];
let selectedModule = null;
let selectedConnection = null;
let draggingModule = null;
let interactingModule = null;
let dragOffset = { x: 0, y: 0 };
let isPatching = false;
let patchStart = null;
let isPanning = false;
let lastMousePos = { x: 0, y: 0 };
let mousePos = { x: 0, y: 0 };
let hoveredConnectorInfo = null;
let audioContextReady = false;

const view = { x: 0, y: 0, zoom: 1, minZoom: 0.2, maxZoom: 2.0 };
const CABLE_COLORS = { audio: '#f0a048', cv: '#ff80ab', gate: '#ff80ab' };

// Helper functions
function screenToWorld(x, y) {
  return { x: (x - view.x) / view.zoom, y: (y - view.y) / view.zoom };
}

async function initAudioContext() {
  try {
    // Resume AudioContext if suspended
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    
    // Load AudioWorklets
    await audioContext.audioWorklet.addModule('./worklets/ring-mod-processor.js');
    await audioContext.audioWorklet.addModule('./worklets/sequencer-processor.js');
    await audioContext.audioWorklet.addModule('./worklets/adsr-processor.js');
    
    audioContextReady = true;
    console.log('AudioContext initialized successfully');
  } catch (error) {
    console.error('Error initializing AudioContext:', error);
    throw error;
  }
}

function draw() {
  // Clear canvas
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  // Apply view transformations
  ctx.save();
  ctx.translate(view.x, view.y);
  ctx.scale(view.zoom, view.zoom);

  // Draw background
  ctx.fillStyle = '#3c3c3c';
  ctx.fillRect(-view.x / view.zoom, -view.y / view.zoom, 
               canvas.width / view.zoom, canvas.height / view.zoom);

  // Draw connections
  ctx.lineWidth = 3.5;
  connections.forEach(conn => {
    const fromPos = { 
      x: conn.fromModule.x + conn.fromConnector.props.x, 
      y: conn.fromModule.y + conn.fromConnector.props.y 
    };
    const toPos = { 
      x: conn.toModule.x + conn.toConnector.props.x, 
      y: conn.toModule.y + conn.toConnector.props.y 
    };
    
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

  // Draw active patch connection
  if (isPatching) {
    ctx.strokeStyle = CABLE_COLORS[patchStart.connector.props.type] || '#888';
    const fromPos = patchStart;
    const worldMouse = screenToWorld(mousePos.x, mousePos.y);
    
    const dist = Math.sqrt(Math.pow(worldMouse.x - fromPos.x, 2) + Math.pow(worldMouse.y - fromPos.y, 2));
    const droop = Math.min(100, dist * 0.4);

    const cp1x = fromPos.x + (fromPos.connector.props.orientation === 'horizontal' ? droop : 0);
    const cp1y = fromPos.y + (fromPos.connector.props.orientation === 'vertical' ? droop : 0);
    
    ctx.beginPath();
    ctx.moveTo(fromPos.x, fromPos.y);
    ctx.bezierCurveTo(cp1x, cp1y, worldMouse.x, worldMouse.y - droop, worldMouse.x, worldMouse.y);
    ctx.stroke();
  }

  // Draw modules
  modules.forEach(module => {
    module.draw(ctx, module === selectedModule, hoveredConnectorInfo);
  });

  ctx.restore();
  requestAnimationFrame(draw);
}

function connectNodes(sourceConnector, destConnector) {
  const sourceNode = sourceConnector.source;
  const destNode = destConnector.target;
  if (!sourceNode || !destNode) {
    console.error("Source or target node is not ready or does not exist.", { sourceConnector, destConnector });
    return;
  }

  const outputIndex = sourceConnector.port || 0;
  const inputIndex = destConnector.inputIndex || 0;

  if (destNode instanceof AudioParam) {
    sourceNode.connect(destNode, outputIndex);
  } else {
    sourceNode.connect(destNode, outputIndex, inputIndex);
  }
}

function disconnectNodes(sourceConnector, destConnector) {
  const sourceNode = sourceConnector.source;
  const destNode = destConnector.target;
  if (!sourceNode || !destNode) return;

  const outputIndex = sourceConnector.port || 0;
  const inputIndex = destConnector.inputIndex || 0;

  try {
    if (destNode instanceof AudioParam) {
      sourceNode.disconnect(destNode, outputIndex);
    } else {
      sourceNode.disconnect(destNode, outputIndex, inputIndex);
    }
  } catch(e) { 
    console.warn("Error disconnecting node:", e); 
  }
}

function deleteSelection() {
  if (selectedConnection) {
    const conn = selectedConnection;
    if (conn.fromConnector.props.source && conn.toConnector.props.target) {
      disconnectNodes(conn.fromConnector.props, conn.toConnector.props);
    }
    connections = connections.filter(c => c !== conn);
    selectedConnection = null;
  } else if (selectedModule && !selectedModule.isPermanent) {
    connections = connections.filter(conn => {
      const shouldRemove = conn.fromModule === selectedModule || conn.toModule === selectedModule;
      if (shouldRemove) {
        if (conn.fromConnector.props.source && conn.toConnector.props.target) {
          disconnectNodes(conn.fromConnector.props, conn.toConnector.props);
        }
      }
      return !shouldRemove;
    });
    
    selectedModule.disconnect?.();
    modules = modules.filter(m => m !== selectedModule);
    selectedModule = null;
  }
}

async function savePatch() {
  const patch = {
    modules: modules.map(m => m.getState ? m.getState() : {}),
    connections: connections.map(c => ({
      fromId: c.fromModule.id,
      fromConnector: c.fromConnector.name,
      toId: c.toModule.id,
      toConnector: c.toConnector.name,
    })).filter(c => c.fromId && c.toId)
  };

  const result = await dialog.showSaveDialog({
    title: 'Guardar Patch', 
    defaultPath: 'patch.json',
    filters: [{ name: 'JSON Files', extensions: ['json'] }]
  });

  if (!result.canceled && result.filePath) {
    fs.writeFileSync(result.filePath, JSON.stringify(patch, null, 2));
  }
}

async function loadPatch() {
  const result = await dialog.showOpenDialog({
    title: 'Cargar Patch', 
    properties: ['openFile'],
    filters: [{ name: 'JSON Files', extensions: ['json'] }]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const patchData = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf-8'));
    await reconstructPatch(patchData);
  }
}

async function reconstructPatch(patchData) {
  modules.filter(m => !m.isPermanent).forEach(m => m.disconnect && m.disconnect());
  modules = modules.filter(m => m.isPermanent);
  connections = [];
  selectedModule = null;
  selectedConnection = null;

  const modulePromises = patchData.modules.map(async (moduleState) => {
    if (moduleState.isPermanent) {
        const existingModule = modules.find(m => m.id === moduleState.id);
        existingModule?.setState?.(moduleState);
        return null;
    }
    
    const ModuleClass = MODULE_CLASSES[moduleState.type];
    if (!ModuleClass) return null;

    const newModule = new ModuleClass(moduleState.x, moduleState.y, moduleState.id, moduleState);
    if (newModule.readyPromise) await newModule.readyPromise;
    return newModule;
  });

  const loadedModules = (await Promise.all(modulePromises)).filter(m => m);
  modules.push(...loadedModules);

  const moduleMap = new Map(modules.map(m => [m.id, m]));
  
  patchData.connections.forEach(connData => {
    const fromModule = moduleMap.get(connData.fromId);
    const toModule = moduleMap.get(connData.toId);
    if (!fromModule || !toModule) return;
    
    const fromConnector = fromModule.outputs?.[connData.fromConnector];
    const toConnector = toModule.inputs?.[connData.toConnector];
    if (!fromConnector || !toConnector) return;

    if (fromConnector.source && toConnector.target) {
      connectNodes(fromConnector, toConnector);
    }

    connections.push({
      fromModule, 
      toModule,
      fromConnector: { name: connData.fromConnector, props: fromConnector },
      toConnector: { name: connData.toConnector, props: toConnector },
      type: fromConnector.type
    });
  });
}

// Interaction functions
function getModuleAt(x, y) {
  return [...modules].reverse().find(m => 
    x >= m.x && x <= m.x + m.width && 
    y >= m.y && y <= m.y + m.height
  );
}

function getModuleAndConnectorAt(x, y) {
  for (const module of [...modules].reverse()) {
    const connector = module.getConnectorAt?.(x, y);
    if (connector) return { module, connector };
  }
  return null;
}

function getConnectionAt(x, y) {
  const threshold = 10 / view.zoom;
  
  for (const conn of connections) {
    const fromPos = { 
      x: conn.fromModule.x + conn.fromConnector.props.x, 
      y: conn.fromModule.y + conn.fromConnector.props.y 
    };
    const toPos = { 
      x: conn.toModule.x + conn.toConnector.props.x, 
      y: conn.toModule.y + conn.toConnector.props.y 
    };
    
    const dist = Math.sqrt(Math.pow(toPos.x - fromPos.x, 2) + Math.pow(toPos.y - fromPos.y, 2));
    const droop = Math.min(100, dist * 0.4);

    const cp1 = { x: fromPos.x + (conn.fromConnector.props.orientation === 'horizontal' ? droop : 0), y: fromPos.y + (conn.fromConnector.props.orientation === 'vertical' ? droop : 0) };
    const cp2 = { x: toPos.x - (conn.toConnector.props.orientation === 'horizontal' ? droop : 0), y: toPos.y + (conn.toConnector.props.orientation === 'vertical' ? droop : 0) };

    for (let t = 0.05; t <= 0.95; t += 0.05) {
      const tx = Math.pow(1-t, 3)*fromPos.x + 3*Math.pow(1-t,2)*t*cp1.x + 3*(1-t)*Math.pow(t,2)*cp2.x + Math.pow(t,3)*toPos.x;
      const ty = Math.pow(1-t, 3)*fromPos.y + 3*Math.pow(1-t,2)*t*cp1.y + 3*(1-t)*Math.pow(t,2)*cp2.y + Math.pow(t,3)*toPos.y;
      if (Math.sqrt(Math.pow(x - tx, 2) + Math.pow(y - ty, 2)) < threshold) return conn;
    }
  }
  return null;
}

async function addModule(type, x, y) {
  const ModuleClass = MODULE_CLASSES[type];
  if (!ModuleClass) return;

  const newModule = new ModuleClass(x, y);
  if (newModule.readyPromise) await newModule.readyPromise;
  modules.push(newModule);
  selectedModule = newModule;
}

// Event handlers
function onMouseDown(e) {
  e.preventDefault();
  if (interactingModule) return;

  mousePos = { x: e.clientX, y: e.clientY };
  const worldPos = screenToWorld(mousePos.x, mousePos.y);

  if (e.button === 1 || e.altKey) { 
    isPanning = true; 
    lastMousePos = mousePos; 
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
      selectedModule = moduleHit;
      selectedConnection = null;
      
      if (moduleHit.checkInteraction?.(worldPos)) {
        interactingModule = moduleHit;
        return;
      }
      
      if (moduleHit.handleClick?.(worldPos.x, worldPos.y)) {
        interactingModule = moduleHit;
        return;
      }
      
      draggingModule = moduleHit;
      dragOffset.x = worldPos.x - moduleHit.x;
      dragOffset.y = worldPos.y - moduleHit.y;
      return;
    }
    
    const connectionHit = getConnectionAt(worldPos.x, worldPos.y);
    if (connectionHit) {
      selectedConnection = connectionHit;
      selectedModule = null;
      return;
    }

    selectedModule = null;
    selectedConnection = null;
    isPanning = true;
    lastMousePos = mousePos;
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

  if (draggingModule) {
    draggingModule.x = worldPos.x - dragOffset.x;
    draggingModule.y = worldPos.y - dragOffset.y;
  } 
  else if (interactingModule?.handleDragInteraction) {
    interactingModule.handleDragInteraction(worldPos);
  } 
  else if (isPanning) {
    view.x += e.movementX;
    view.y += e.movementY;
  }
}

function onMouseUp(e) {
  e.preventDefault();
  canvas.classList.remove('grabbing');
  canvas.style.cursor = 'grab';

  if (interactingModule?.endInteraction) {
    interactingModule.endInteraction();
  }

  if (isPatching) {
    const worldPos = screenToWorld(mousePos.x, mousePos.y);
    const hit = getModuleAndConnectorAt(worldPos.x, worldPos.y);
    
    if (hit && hit.connector.type === 'input' && hit.module !== patchStart.module) {
      connectNodes(patchStart.connector.props, hit.connector.props);
      connections.push({
        fromModule: patchStart.module,
        fromConnector: patchStart.connector,
        toModule: hit.module,
        toConnector: hit.connector,
        type: patchStart.connector.props.type
      });
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
  if (getModuleAt(worldPos.x, worldPos.y)) return;

  contextMenu.style.left = `${e.clientX}px`;
  contextMenu.style.top = `${e.clientY}px`;
  contextMenu.style.display = 'block';
}

function onKeyDown(e) {
  if (e.target.tagName === 'INPUT') return;
  
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    deleteSelection();
  }
  
  const keyboardModule = modules.find(m => m instanceof Keyboard);
  if (keyboardModule) {
    keyboardModule.handleKeyDown(e.key.toLowerCase());
  }
}

function onKeyUp(e) {
  if (e.target.tagName === 'INPUT') return;
  
  const keyboardModule = modules.find(m => m instanceof Keyboard);
  if (keyboardModule) {
    keyboardModule.handleKeyUp(e.key.toLowerCase());
  }
}

function onWheel(e) {
  e.preventDefault();
  const worldPos = screenToWorld(e.clientX, e.clientY);
  const zoomAmount = e.deltaY < 0 ? 1.1 : 1/1.1;
  const newZoom = Math.max(view.minZoom, Math.min(view.maxZoom, view.zoom * zoomAmount));
  
  view.x = e.clientX - worldPos.x * newZoom;
  view.y = e.clientY - worldPos.y * newZoom;
  view.zoom = newZoom;
}

// Setup function
async function setup() {
  try {
    await initAudioContext();
    
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const keyboard = new Keyboard(canvas.width / 2 - 125, canvas.height - 150, 'keyboard-main');
    modules.push(keyboard);

    const outputModule = {
      id: 'output-main',
      x: canvas.width / 2 - 50, y: 50, width: 100, height: 80, 
      isPermanent: true, type: 'Output',
      inputs: { 'audio': { x: 0, y: 40, type: 'audio', target: audioContext.destination, orientation: 'horizontal' } },
      outputs: {},
      draw: function(ctx, isSelected) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.fillStyle = '#1a1a1a';
        ctx.strokeStyle = isSelected ? '#aaffff' : '#888';
        ctx.lineWidth = 2;
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.strokeRect(0, 0, this.width, this.height);
        
        // Dibuja el icono del altavoz
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

        // Dibuja las ondas de sonido
        ctx.strokeStyle = '#E0E0E0';
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(speakerX + 15, speakerY, 8 + i * 6, -Math.PI / 4, Math.PI / 4);
            ctx.stroke();
        }

        // Dibuja el conector de entrada
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
      getState: function() { return { id: this.id, type: this.type, x: this.x, y: this.y, isPermanent: this.isPermanent }; },
      setState: function(state) { this.x = state.x; this.y = state.y; }
    };
    modules.push(outputModule);

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
        const moduleType = e.target.getAttribute('data-module');
        const worldPos = screenToWorld(
          parseFloat(contextMenu.style.left.slice(0, -2)), 
          parseFloat(contextMenu.style.top.slice(0, -2))
        );
        await addModule(moduleType, worldPos.x, worldPos.y);
        contextMenu.style.display = 'none';
      });
    });

    window.addEventListener('click', (e) => {
      if (!contextMenu.contains(e.target)) contextMenu.style.display = 'none';
      if (!patchContextMenu.contains(e.target)) patchContextMenu.style.display = 'none';
    });

    window.addEventListener('resize', () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    });

    draw();
    
  } catch (error) {
    console.error('Error during setup:', error);
  }
}

// Start the application
setup();