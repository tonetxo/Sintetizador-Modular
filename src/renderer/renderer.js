// src/renderer/renderer.js

import { ModuleManager } from '../modules/core/ModuleManager.js';
import { registerProcessors } from '../worklets/processors/index.js';
import { moduleConfig } from '../moduleConfig.js';
import { CanvasManager } from './CanvasManager.js';

class Renderer {
    constructor() {
        this.isReady = false;
        this.defaultModulesCreated = false;
        
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
            latencyHint: 'interactive',
            sampleRate: 48000
        });

        this.moduleManager = new ModuleManager(this.audioContext);
        this.canvasManager = new CanvasManager('main-canvas', this.moduleManager);
        
        this.setupAudioContext();
        this.setupEventListeners();
        this.createContextMenu();
        this.addResumeListener();
    }
    
    async setupAudioContext() {
        try {
            await registerProcessors(this.audioContext);
            this.isReady = true; 
            console.log("✅ All audio processors registered successfully. System ready.");
            this.moduleManager.errorHandler.showSuccess("Sistema de audio listo.");
            await this.createDefaultModules();
        } catch (error) {
            console.error('Error during audio context setup:', error);
            this.moduleManager.errorHandler.showError(new Error(`Fatal: ${error.message}`));
        }
    }

    async createDefaultModules() {
        if (this.defaultModulesCreated) return;
        
        const keyboardId = 'keyboard-main';
        const speakerId = 'speaker-main';

        let keyboard = this.moduleManager.getModuleById(keyboardId);
        if (!keyboard) {
            keyboard = await this.moduleManager.createModule('keyboard', 50, window.innerHeight - 150, { id: keyboardId, isPermanent: true });
        }
        
        if (!this.moduleManager.getModuleById(speakerId)) {
             await this.moduleManager.createModule('speaker', window.innerWidth - 200, window.innerHeight / 2 - 60, { id: speakerId, isPermanent: true });
        }
        
        if (keyboard) {
            this.canvasManager.setKeyboardHandler(keyboard);
        }
        
        this.defaultModulesCreated = true;
    }

    addResumeListener() {
        const resume = () => {
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume().catch(err => console.error("Error resuming AudioContext:", err));
            }
            document.body.removeEventListener('click', resume, true);
        };
        document.body.addEventListener('click', resume, true);
    }

    setupEventListeners() {
        // --- CORRECCIÓN --- Este listener ahora solo gestiona el menú de creación
        document.addEventListener('contextmenu', (e) => {
            if (!this.isReady) return;
            
            // Prevenir el menú nativo en cualquier caso
            e.preventDefault();
            this.canvasManager.updateWorldMousePos(e);
            
            // Solo mostrar el menú de creación si no estamos sobre un módulo
            const module = this.canvasManager.getModuleAt(this.canvasManager.worldMousePos.x, this.canvasManager.worldMousePos.y);
            if (!module) {
                this.showContextMenu(e.clientX, e.clientY);
            }
        });

        window.api.on('audio-decoded', (result) => {
            if (result.success && result.moduleId) {
                this.moduleManager.loadDecodedData(result.moduleId, result.decodedData);
            } else {
                this.moduleManager.errorHandler.showError(new Error(result.error));
            }
        });
        
        window.api.on('request-save-patch', () => this.moduleManager.saveState());
        window.api.on('request-load-patch', () => this.moduleManager.loadState());
        window.api.on('request-undo', () => this.moduleManager.history.undo());
        window.api.on('request-redo', () => this.moduleManager.history.redo());
    }

    createContextMenu() {
        if (document.getElementById('context-menu')) return;
        const menu = document.createElement('div');
        menu.id = 'context-menu';
        menu.className = 'context-menu';
        document.body.appendChild(menu);
        if (!moduleConfig || Object.keys(moduleConfig).length === 0) {
            menu.innerHTML = `<div class="context-menu-item" style="color: red;">Error: Módulos no encontrados</div>`;
            return;
        }
        let menuHTML = '';
        for (const category in moduleConfig) {
            menuHTML += `<div class="context-menu-category">${category}</div>`;
            for (const moduleKey in moduleConfig[category]) {
                menuHTML += `<div class="context-menu-item" data-module="${moduleKey}">${moduleConfig[category][moduleKey].name}</div>`;
            }
        }
        menu.innerHTML = menuHTML;
    }

    showContextMenu(x, y) {
        let menu = document.getElementById('module-context-menu');
        if(menu) menu.remove(); // Ocultar el otro menú por si acaso

        menu = document.getElementById('context-menu');
        menu.style.display = 'block';
        
        const menuRect = menu.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;

        let finalX = x;
        let finalY = y;

        if (x + menuRect.width > windowWidth) { finalX = windowWidth - menuRect.width - 5; }
        if (y + menuRect.height > windowHeight) { finalY = windowHeight - menuRect.height - 5; }
        menu.style.left = `${finalX}px`;
        menu.style.top = `${finalY}px`;

        const clickHandler = async (e) => {
            menu.style.display = 'none';
            document.removeEventListener('click', clickHandler);
            document.removeEventListener('contextmenu', contextHandler, true);

            const moduleItem = e.target.closest('.context-menu-item');
            if (moduleItem && moduleItem.dataset.module) {
                const moduleType = moduleItem.dataset.module;
                try {
                    await this.moduleManager.createModule(moduleType, this.canvasManager.worldMousePos.x, this.canvasManager.worldMousePos.y);
                } catch (error) {
                    console.error(`Error creating module ${moduleType}:`, error);
                }
            }
        };
        
        const contextHandler = (e) => {
            e.preventDefault();
            menu.style.display = 'none';
            document.removeEventListener('click', clickHandler);
            document.removeEventListener('contextmenu', contextHandler, true);
        };

        setTimeout(() => {
            document.addEventListener('click', clickHandler, { once: true });
            document.addEventListener('contextmenu', contextHandler, { once: true, capture: true });
        }, 0);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.renderer = new Renderer();
});