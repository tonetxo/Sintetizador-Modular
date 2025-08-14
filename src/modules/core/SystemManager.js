import { ModuleManager } from './ModuleManager.js';
import { registerProcessors } from '../../worklets/processors/index.js';

export class SystemManager {
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.moduleManager = new ModuleManager(this.audioContext);
        
        this.settings = {
            sampleRate: this.audioContext.sampleRate,
            bufferSize: 1024,
            maxHistorySize: 50,
            maxCacheSize: 500 * 1024 * 1024 // 500MB
        };

        this.initialize();
    }

    async initialize() {
        try {
            await this.initializeAudioContext();
            await this.loadWorklets();
            this.setupEventListeners();
            this.moduleManager.errorHandler.showSuccess('Sistema iniciado correctamente');
        } catch (error) {
            this.moduleManager.errorHandler.showError(error);
        }
    }

    async initializeAudioContext() {
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }

    async loadWorklets() {
        try {
            await registerProcessors(this.audioContext);
        } catch (error) {
            throw new Error(`Error loading worklets: ${error.message}`);
        }
    }

    setupEventListeners() {
        // Keyboard shortcuts
        document.addEventListener('keydown', this.handleKeyboardShortcuts.bind(this));

        // Audio file handling
        window.api.on('audio-file-selected', this.handleAudioFile.bind(this));

        // Context menu
        document.addEventListener('contextmenu', this.handleContextMenu.bind(this));
        document.addEventListener('click', this.handleClick.bind(this));
    }

    handleKeyboardShortcuts(e) {
        if (e.ctrlKey || e.metaKey) {
            switch (e.key.toLowerCase()) {
                case 'z':
                    e.preventDefault();
                    if (e.shiftKey) {
                        this.redo();
                    } else {
                        this.undo();
                    }
                    break;
                case 'y':
                    e.preventDefault();
                    this.redo();
                    break;
                case 's':
                    e.preventDefault();
                    this.saveState();
                    break;
                case 'o':
                    e.preventDefault();
                    this.loadState();
                    break;
            }
        }
    }

    async handleAudioFile(result) {
        if (!result.success || !result.moduleId) return;

        try {
            await this.moduleManager.loadAudioFile(result.file, result.moduleId);
        } catch (error) {
            this.moduleManager.errorHandler.showError(error);
        }
    }

    handleContextMenu(e) {
        e.preventDefault();
        const menu = document.getElementById('context-menu');
        menu.style.display = 'block';
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;
        this.newModulePosition = { x: e.clientX, y: e.clientY };
    }

    async handleClick(e) {
        const menu = document.getElementById('context-menu');
        if (e.target.closest('#context-menu')) {
            const moduleType = e.target.dataset.module;
            if (moduleType) {
                try {
                    await this.createModule(moduleType);
                } catch (error) {
                    this.moduleManager.errorHandler.showError(error);
                }
            }
        }
        menu.style.display = 'none';
    }

    async createModule(type) {
        try {
            await this.moduleManager.createModule(
                type,
                this.newModulePosition.x,
                this.newModulePosition.y
            );
        } catch (error) {
            this.moduleManager.errorHandler.showError(error);
            throw error;
        }
    }

    undo() {
        this.moduleManager.undo();
    }

    redo() {
        this.moduleManager.redo();
    }

    async saveState() {
        try {
            const state = await this.moduleManager.serializeState();
            await window.api.saveState(state);
            this.moduleManager.errorHandler.showSuccess('Estado guardado correctamente');
        } catch (error) {
            this.moduleManager.errorHandler.showError(error);
        }
    }

    async loadState() {
        try {
            const state = await window.api.loadState();
            await this.moduleManager.deserializeState(state);
            this.moduleManager.errorHandler.showSuccess('Estado cargado correctamente');
        } catch (error) {
            this.moduleManager.errorHandler.showError(error);
        }
    }

    destroy() {
        this.moduleManager.destroy();
    }
}