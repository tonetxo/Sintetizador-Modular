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
import { Keyboard } from './modules/Keyboard.js';

const { dialog } = require('@electron/remote');
const fs = require('fs');

const canvas = document.getElementById('synth-canvas');
const ctx = canvas.getContext('2d');
const contextMenu = document.getElementById('context-menu');
const patchContextMenu = document.getElementById('patch-context-menu');

const MODULE_CLASSES = { VCO, VCF, ADSR, VCA, LFO, Mixer, RingMod, SampleAndHold };

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

const view = { x: 0, y: 0, zoom: 1, minZoom: 0.2, maxZoom: 2.0 };
const CABLE_COLORS = { audio: '#f0a048', cv: '#ff80ab', gate: '#ff80ab' };

function screenToWorld(x, y) {
    return { x: (x - view.x) / view.zoom, y: (y - view.y) / view.zoom };
}

function setup() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const keyboard = new Keyboard(canvas.width / 2 - 125, canvas.height - 150);
    modules.push(keyboard);
    
    const masterOutputNode = audioContext.destination;
    
    const outputModule = {
        x: canvas.width / 2 - 50, y: 50, width: 100, height: 80, isPermanent: true, type: 'Output',
        inputs: { 'audio': { x: 0, y: 40, type: 'audio', target: masterOutputNode, orientation: 'horizontal' } },
        outputs: {},
        draw: function(ctx, isSelected, hovered) {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.fillStyle = '#1a1a1a';
            ctx.strokeStyle = isSelected ? '#aaffff' : '#888';
            ctx.lineWidth = 2;
            ctx.fillRect(0, 0, this.width, this.height);
            ctx.strokeRect(0, 0, this.width, this.height);
            ctx.fillStyle = '#E0E0E0';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('SALIDA', this.width / 2, this.height / 2 + 5);
            ctx.restore();
            
            const isHovered = hovered && hovered.module === this;
            const connectorRadius = 8;
            const x = this.x + this.inputs.audio.x;
            const y = this.y + this.inputs.audio.y;
            ctx.beginPath();
            ctx.arc(x, y, connectorRadius, 0, Math.PI * 2);
            ctx.fillStyle = isHovered ? 'white' : '#4a90e2';
            ctx.fill();
        },
        getConnectorAt: function(x, y) {
            for (const [name, props] of Object.entries(this.inputs)) {
                const dist = Math.sqrt(Math.pow(x - (this.x + props.x), 2) + Math.pow(y - (this.y + props.y), 2));
                if (dist < 9) return { name, type: 'input', props, module: this };
            }
            return null;
        }
    };
    modules.push(outputModule);
    
    draw();
    setupEventListeners();
}

function draw() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.zoom, view.zoom);
    ctx.fillStyle = '#3c3c3c';
    ctx.fillRect(-view.x / view.zoom, -view.y / view.zoom, canvas.width / view.zoom, canvas.height / view.zoom);

    ctx.lineWidth = 3.5;
    connections.forEach(conn => {
        const fromPos = { x: conn.fromModule.x + conn.fromConnector.props.x, y: conn.fromModule.y + conn.fromConnector.props.y };
        const toPos = { x: conn.toModule.x + conn.toConnector.props.x, y: conn.toModule.y + conn.toConnector.props.y };
        
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

    modules.forEach(module => module.draw(ctx, module === selectedModule, hoveredConnectorInfo));
    ctx.restore();
    requestAnimationFrame(draw);
}

function connectNodes(sourceNode, destConnector) {
    const target = destConnector.target;
    if (!target) {
        console.error("Target node is not ready or does not exist.", destConnector);
        return;
    }

    if (target instanceof AudioWorkletNode) {
        sourceNode.connect(target, 0, destConnector.inputIndex);
    } else if (target instanceof AudioParam) {
        sourceNode.connect(target);
    } else {
        sourceNode.connect(target, 0, destConnector.inputIndex || 0);
    }
}

function disconnectNodes(sourceNode, destConnector) {
    const target = destConnector.target;
    if (!target) return;

    try {
        if (target instanceof AudioWorkletNode) {
            sourceNode.disconnect(target, 0, destConnector.inputIndex);
        } else if (target instanceof AudioParam) {
            sourceNode.disconnect(target);
        } else {
            sourceNode.disconnect(target, 0, destConnector.inputIndex || 0);
        }
    } catch(e) { console.warn("Error disconnecting node:", e); }
}

function deleteSelection() {
    if (selectedConnection) {
        const conn = selectedConnection;
        if (conn.fromConnector.props.type !== 'gate') {
            disconnectNodes(conn.fromConnector.props.source, conn.toConnector.props);
        } else {
            if(conn.fromModule.disconnectGate) conn.fromModule.disconnectGate(conn.toModule);
        }
        const index = connections.indexOf(conn);
        if (index > -1) connections.splice(index, 1);
        selectedConnection = null;
    } else if (selectedModule && !selectedModule.isPermanent) {
        if (selectedModule.disconnect) { selectedModule.disconnect(); }
        connections = connections.filter(conn => {
            const shouldRemove = conn.fromModule === selectedModule || conn.toModule === selectedModule;
            if (shouldRemove) {
                if (conn.fromConnector.props.type !== 'gate') {
                     disconnectNodes(conn.fromConnector.props.source, conn.toConnector.props);
                } else {
                    if(conn.fromModule.disconnectGate) conn.fromModule.disconnectGate(conn.toModule);
                }
            }
            return !shouldRemove;
        });
        const index = modules.indexOf(selectedModule);
        if(index > -1) modules.splice(index, 1);
        selectedModule = null;
    }
}

function savePatch() {
    const patch = {
        modules: modules.map(m => m.getState ? m.getState() : { type: m.type, x: m.x, y: m.y, isPermanent: m.isPermanent }),
        connections: connections.map(c => ({
            from: modules.indexOf(c.fromModule),
            fromConnector: c.fromConnector.name,
            to: modules.indexOf(c.toModule),
            toConnector: c.toConnector.name,
        }))
    };
    dialog.showSaveDialog({
        title: 'Guardar Patch', defaultPath: 'patch.json',
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
    }).then(result => {
        if (!result.canceled && result.filePath) {
            fs.writeFileSync(result.filePath, JSON.stringify(patch, null, 2));
        }
    });
}

async function loadPatch() {
    const result = await dialog.showOpenDialog({
        title: 'Cargar Patch', properties: ['openFile'],
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });

    if (!result.canceled && result.filePaths.length > 0) {
        const patchData = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf-8'));
        await reconstructPatch(patchData);
    }
}

async function reconstructPatch(patchData) {
    modules.filter(m => !m.isPermanent).forEach(m => m.disconnect && m.disconnect());
    const permanentModules = modules.filter(m => m.isPermanent);
    modules = [...permanentModules];
    connections = [];
    selectedModule = null;

    const modulePromises = patchData.modules.map(async (moduleState) => {
        if (moduleState.isPermanent || !moduleState.type) return null;
        const ModuleClass = MODULE_CLASSES[moduleState.type];
        if (ModuleClass) {
            const newModule = new ModuleClass(moduleState.x, moduleState.y);
            if (newModule.readyPromise) await newModule.readyPromise;
            if (newModule.setState) newModule.setState(moduleState);
            return newModule;
        }
        return null;
    });

    const loadedModules = (await Promise.all(modulePromises)).filter(m => m !== null);
    modules.push(...loadedModules);

    patchData.connections.forEach(connData => {
        const fromModule = modules[connData.from];
        const toModule = modules[connData.to];
        if (!fromModule || !toModule) return;
        const fromConnector = fromModule.outputs[connData.fromConnector];
        const toConnector = toModule.inputs[connData.toConnector];
        if (!fromConnector || !toConnector) return;

        if (fromConnector.type === 'gate') {
            if (fromModule.connectGate) fromModule.connectGate(toModule);
        } else {
            connectNodes(fromConnector.source, toConnector);
        }
        connections.push({
            fromModule, toModule,
            fromConnector: { name: connData.fromConnector, props: fromConnector },
            toConnector: { name: connData.toConnector, props: toConnector },
            type: fromConnector.type
        });
    });
}

function setupEventListeners() {
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('contextmenu', onContextMenu);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.getElementById('save-patch-btn').addEventListener('click', savePatch);
    document.getElementById('load-patch-btn').addEventListener('click', loadPatch);
    
    document.querySelectorAll('#context-menu .context-menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const moduleType = e.target.getAttribute('data-module');
            const worldPos = screenToWorld(contextMenu.style.left.slice(0,-2), contextMenu.style.top.slice(0,-2));
            addModule(moduleType, worldPos.x, worldPos.y);
            contextMenu.style.display = 'none';
        });
    });
    window.addEventListener('click', (e) => { 
        if (!patchContextMenu.contains(e.target)) {
            patchContextMenu.style.display = 'none';
        }
        if (!contextMenu.contains(e.target)) {
            contextMenu.style.display = 'none';
        }
    });
}

async function addModule(type, x, y) {
    const ModuleClass = MODULE_CLASSES[type];
    if (ModuleClass) {
        const newModule = new ModuleClass(x, y);
        if (newModule.readyPromise) {
            await newModule.readyPromise;
        }
        modules.push(newModule);
        selectedModule = newModule;
    }
}

function getModuleAt(x, y) {
    return [...modules].reverse().find(m => x >= m.x && x <= m.x + m.width && y >= m.y && y <= m.y + m.height);
}

function getModuleAndConnectorAt(x, y) {
    for (const module of [...modules].reverse()) {
        const connector = module.getConnectorAt(x, y);
        if (connector) return { module, connector };
    }
    return null;
}

function showPatchContextMenu(e) {
    const outputType = patchStart.connector.props.type;
    const compatibleInputs = [];

    modules.forEach(module => {
        if (module === patchStart.module) return;
        Object.entries(module.inputs).forEach(([name, props]) => {
            const isCompatible = (outputType === props.type) || 
                                 (outputType === 'audio' && props.type === 'cv') ||
                                 (outputType === 'cv' && props.type === 'gate');
            if (isCompatible) {
                compatibleInputs.push({ module, connectorName: name, connectorProps: props });
            }
        });
    });

    patchContextMenu.innerHTML = '';
    if (compatibleInputs.length === 0) {
        const item = document.createElement('div');
        item.className = 'context-menu-item';
        item.textContent = 'No hay entradas compatibles';
        item.style.color = '#888';
        patchContextMenu.appendChild(item);
    } else {
        compatibleInputs.forEach(hit => {
            const item = document.createElement('div');
            item.className = 'context-menu-item';
            const moduleName = hit.module.type || 'Módulo';
            item.textContent = `Conectar a: ${moduleName} -> ${hit.connectorName}`;
            item.onclick = () => {
                if (patchStart.connector.props.type === 'gate') {
                    if (patchStart.module.connectGate) patchStart.module.connectGate(hit.module);
                } else {
                    connectNodes(patchStart.connector.props.source, hit.connectorProps);
                }
                connections.push({
                    fromModule: patchStart.module, fromConnector: patchStart.connector,
                    toModule: hit.module, toConnector: { name: hit.connectorName, props: hit.connectorProps },
                    type: patchStart.connector.props.type
                });
                patchContextMenu.style.display = 'none';
            };
            patchContextMenu.appendChild(item);
        });
    }

    patchContextMenu.style.left = `${e.clientX}px`;
    patchContextMenu.style.top = `${e.clientY}px`;
    patchContextMenu.style.display = 'block';
}

function onMouseDown(e) {
    mousePos = { x: e.clientX, y: e.clientY };
    const worldPos = screenToWorld(mousePos.x, mousePos.y);
    if (e.button === 1 || e.altKey) { isPanning = true; lastMousePos = mousePos; return; }

    if (e.button === 0) {
        patchContextMenu.style.display = 'none';
        const connectorHit = getModuleAndConnectorAt(worldPos.x, worldPos.y);
        if (connectorHit && connectorHit.connector.type === 'output') {
            isPatching = true;
            patchStart = {
                x: connectorHit.module.x + connectorHit.connector.props.x, y: connectorHit.module.y + connectorHit.connector.props.y,
                module: connectorHit.module, connector: connectorHit.connector
            };
            return;
        }

        const moduleHit = getModuleAt(worldPos.x, worldPos.y);
        if (moduleHit) {
            selectedModule = moduleHit;
            selectedConnection = null; // Deseleccionar cable al seleccionar módulo
            if (moduleHit.checkInteraction && moduleHit.checkInteraction(worldPos)) {
                interactingModule = moduleHit;
                return;
            }
            if (moduleHit.handleClick && moduleHit.handleClick(worldPos.x, worldPos.y)) { return; }
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
        selectedConnection = null; // Deseleccionar todo al pinchar en el fondo
        isPanning = true;
        lastMousePos = mousePos;
        canvas.classList.add('grabbing');
    }
}

function onMouseMove(e) {
    mousePos = { x: e.clientX, y: e.clientY };
    const worldPos = screenToWorld(mousePos.x, mousePos.y);
    const hit = getModuleAndConnectorAt(worldPos.x, worldPos.y);
    hoveredConnectorInfo = hit;
    canvas.style.cursor = hit ? 'pointer' : (isPanning || canvas.classList.contains('grabbing') ? 'grabbing' : 'grab');

    if (isPanning) {
        const dx = mousePos.x - lastMousePos.x;
        const dy = mousePos.y - lastMousePos.y;
        view.x += dx; view.y += dy;
        lastMousePos = mousePos;
        return;
    }
    if (interactingModule) {
        interactingModule.handleDragInteraction(e.movementX, e.movementY, e.shiftKey);
        return;
    }
    if (draggingModule) {
        draggingModule.x = worldPos.x - dragOffset.x;
        draggingModule.y = worldPos.y - dragOffset.y;
    }
}

function onMouseUp(e) {
    canvas.classList.remove('grabbing');
    canvas.style.cursor = 'grab';

    if (interactingModule && interactingModule.endInteraction) { interactingModule.endInteraction(); }

    if (isPatching) {
        const worldPos = screenToWorld(mousePos.x, mousePos.y);
        const hit = getModuleAndConnectorAt(worldPos.x, worldPos.y);
        
        if (hit && hit.connector.type === 'input') {
            const outputType = patchStart.connector.props.type;
            const inputType = hit.connector.props.type;
            const isCompatible = (outputType === inputType) || 
                                 (outputType === 'audio' && inputType === 'cv') ||
                                 (outputType === 'cv' && inputType === 'gate');

            if (isCompatible) {
                if (patchStart.connector.props.type === 'gate') {
                    if (patchStart.module.connectGate) patchStart.module.connectGate(hit.module);
                } else {
                    connectNodes(patchStart.connector.props.source, hit.connector.props);
                }
                connections.push({
                    fromModule: patchStart.module, fromConnector: patchStart.connector,
                    toModule: hit.module, toConnector: hit.connector,
                    type: patchStart.connector.props.type
                });
            }
        } else if (!getModuleAt(worldPos.x, worldPos.y)) {
            showPatchContextMenu(e);
        }
    }
    
    draggingModule = null; isPatching = false; patchStart = null; isPanning = false; interactingModule = null;
}

function onContextMenu(e) {
    e.preventDefault();
    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.top = `${e.clientY}px`;
    contextMenu.style.display = 'block';
}

function onKeyDown(e) {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); }
    const keyboardModule = modules.find(m => m instanceof Keyboard);
    if (keyboardModule && !interactingModule) { keyboardModule.handleKeyDown(e.key.toLowerCase()); }
}

function onKeyUp(e) {
    if (e.target.tagName === 'INPUT') return;
    const keyboardModule = modules.find(m => m instanceof Keyboard);
    if (keyboardModule) { keyboardModule.handleKeyUp(e.key.toLowerCase()); }
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

function getPointOnBezier(t, p0, p1, cp1, cp2) {
    const c = (1 - t);
    const b0 = c * c * c;
    const b1 = 3 * c * c * t;
    const b2 = 3 * c * t * t;
    const b3 = t * t * t;
    const x = b0 * p0.x + b1 * cp1.x + b2 * cp2.x + b3 * p1.x;
    const y = b0 * p0.y + b1 * cp1.y + b2 * cp2.y + b3 * p1.y;
    return { x, y };
}

function getConnectionAt(x, y) {
    const threshold = 10 / view.zoom; // Aumentado de 6 a 10 para facilitar la selección
    for (const conn of connections) {
        const fromPos = { x: conn.fromModule.x + conn.fromConnector.props.x, y: conn.fromModule.y + conn.fromConnector.props.y };
        const toPos = { x: conn.toModule.x + conn.toConnector.props.x, y: conn.toModule.y + conn.toConnector.props.y };
        
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
            const p = getPointOnBezier(t, fromPos, toPos, cp1, cp2);
            const distToPoint = Math.sqrt(Math.pow(x - p.x, 2) + Math.pow(y - p.y, 2));
            if (distToPoint < threshold) {
                return conn;
            }
        }
    }
    return null;
}

setup();