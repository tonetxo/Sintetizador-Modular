// src/modules/core/ModuleManager.js

import { VCO } from '../audio/oscillators/VCO.js';
import { VCF } from '../audio/filters/VCF.js';
import { VCA } from '../VCA.js';
import { ADSR } from '../audio/modulators/ADSR.js';
import { LFO } from '../audio/modulators/LFO.js';
import { RingModulator } from '../audio/modulators/RingModulator.js';
import { SampleAndHold } from '../audio/modulators/SampleAndHold.js';
import { Reverb } from '../audio/effects/Reverb.js';
import { Delay } from '../audio/effects/Delay.js';
import { Chorus } from '../audio/effects/Chorus.js';
import { Flanger } from '../audio/effects/Flanger.js';
import { Phaser } from '../audio/effects/Phaser.js';
import { Compressor } from '../audio/effects/Compressor.js';
import { Sequencer } from '../sequencing/Sequencer.js';
import { Arpeggiator } from '../sequencing/Arpeggiator.js';
import { Clock } from '../sequencing/Clock.js';
import { Oscilloscope } from '../analysis/Oscilloscope.js';
import { Mixer } from '../mixing/Mixer.js';
import { MathModule } from '../math/MathModule.js';
import { AudioPlayer } from '../audio/AudioPlayer.js';
import { GranularSampler } from '../audio/GranularSampler.js';
import { NoiseGenerator } from '../NoiseGenerator.js';
import { Speaker } from '../Speaker.js';
import { Keyboard } from '../Keyboard.js';
import { HistoryManager } from './History.js';
import { AudioCache } from './AudioCache.js';
import { ErrorHandler } from './ErrorHandler.js';

export class ModuleManager {
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.modules = new Map();
        this.connections = new Set();
        this.history = new HistoryManager();
        this.audioCache = new AudioCache();
        this.errorHandler = new ErrorHandler();
    }
    
    getModuleById(id) {
        return this.modules.get(id);
    }

    async createModule(type, x, y, initialState = {}) {
        try {
            let module;
            const moduleTypeKey = type.toLowerCase();
            const id = initialState.id || `${moduleTypeKey}-${Date.now()}`;
            
            const moduleConstructors = {
                vco: VCO, vcf: VCF, vca: VCA, adsr: ADSR, lfo: LFO,
                ringmod: RingModulator, 's&h': SampleAndHold, reverb: Reverb,
                delay: Delay, chorus: Chorus, flanger: Flanger, phaser: Phaser,
                compressor: Compressor, sequencer: Sequencer, arpeggiator: Arpeggiator,
                clock: Clock, oscilloscope: Oscilloscope, mixer: Mixer, math: MathModule,
                audioplayer: AudioPlayer, granularsampler: GranularSampler,
                noise: NoiseGenerator, speaker: Speaker, keyboard: Keyboard,
            };

            const constructor = moduleConstructors[moduleTypeKey];
            if (!constructor) throw new Error(`Unknown module type: ${type}`);
            
            module = new constructor(this.audioContext, x, y, id, initialState);

            if (module) {
                if (module.readyPromise) {
                    await module.readyPromise;
                }
                this.modules.set(id, module);
                if (!initialState.id) {
                    this.errorHandler.showSuccess(`Módulo ${type} creado`);
                }
                return module;
            }
        } catch (error) {
            this.errorHandler.showError(error);
            console.error(error);
            return null;
        }
    }
    
    deleteModule(moduleId) {
        const moduleToDelete = this.modules.get(moduleId);
        if (!moduleToDelete || moduleToDelete.isPermanent) return;

        const connectionsToDelete = [...this.connections].filter(conn => 
            conn.sourceModule.id === moduleId || conn.destModule.id === moduleId
        );
        connectionsToDelete.forEach(conn => this.removeConnection(conn));

        if (typeof moduleToDelete.destroy === 'function') {
            moduleToDelete.destroy();
        }

        this.modules.delete(moduleId);
        this.errorHandler.showSuccess(`Módulo eliminado`);
    }

    addConnection(sourceModule, sourcePortName, destModule, destPortName) {
        const sourcePort = sourceModule.outputs[sourcePortName];
        const destPort = destModule.inputs[destPortName];

        if (!sourcePort || !destPort) {
            console.error("Conexión inválida: puerto no encontrado.", { sourceModule, sourcePortName, destModule, destPortName });
            return;
        }
        
        const sourceNode = sourcePort.source;
        const destNodeOrParam = destPort.target;
        
        if (sourceNode === undefined || destNodeOrParam === undefined || destNodeOrParam === null) {
            const moduleName = (sourceNode === undefined) ? sourceModule.type : destModule.type;
            this.errorHandler.showError(new Error(`El módulo ${moduleName} no está listo para conectar.`));
            console.warn("Conexión abortada por nodo no listo", { sourceNode, destNodeOrParam });
            return;
        }

        try {
            if (destNodeOrParam instanceof AudioParam) {
                sourceNode.connect(destNodeOrParam, sourcePort.channel || 0);
            } else if (destNodeOrParam instanceof AudioNode) {
                // --- CAMBIO: Usar el canal especificado en el puerto de salida ---
                // Si `sourcePort.channel` no está definido, usa 0 por defecto.
                const outputChannelIndex = sourcePort.channel || 0;
                const inputChannelIndex = destPort.inputIndex || 0;
                sourceNode.connect(destNodeOrParam, outputChannelIndex, inputChannelIndex);
            } else {
                throw new Error("El destino de la conexión no es un AudioNode o AudioParam válido.");
            }

            const connection = {
                id: `${sourceModule.id}:${sourcePortName}-${destModule.id}:${destPortName}`,
                sourceModule,
                sourcePortName,
                destModule,
                destPortName,
                type: sourcePort.type
            };
            this.connections.add(connection);

        } catch (e) {
            console.error("Error al realizar la conexión:", e, { sourceModule, sourcePortName, destModule, destPortName });
            this.errorHandler.showError(new Error(`Error al conectar: ${e.message}`));
        }
    }
    
    removeConnection(connection) {
        if (!this.connections.has(connection)) return;

        const { sourceModule, sourcePortName, destModule, destPortName } = connection;
        const sourcePort = sourceModule.outputs[sourcePortName];
        const destPort = destModule.inputs[destPortName];

        if (sourcePort && destPort) {
            const sourceNode = sourcePort.source;
            const destNodeOrParam = destPort.target;
            if (sourceNode && destNodeOrParam) {
                try {
                    // --- CAMBIO: Desconectar del canal específico si es posible ---
                    if (destNodeOrParam instanceof AudioNode) {
                         const outputChannelIndex = sourcePort.channel || 0;
                         sourceNode.disconnect(destNodeOrParam, outputChannelIndex);
                    } else {
                         sourceNode.disconnect(destNodeOrParam, sourcePort.channel || 0);
                    }
                } catch (e) {
                    console.warn("Error al desconectar (puede ser benigno si el destino ya fue desconectado):", e);
                }
            }
        }
        
        this.connections.delete(connection);
    }

    async loadDecodedData(moduleId, decodedData) {
        try {
            const audioBuffer = this.audioContext.createBuffer(
                decodedData.numberOfChannels,
                decodedData.length,
                decodedData.sampleRate
            );

            for (let i = 0; i < decodedData.numberOfChannels; i++) {
                audioBuffer.copyToChannel(new Float32Array(decodedData.channelData[i]), i);
            }
            
            const module = this.modules.get(moduleId);
            if (module && typeof module.loadDecodedData === 'function') {
                await module.loadDecodedData(audioBuffer);
                this.errorHandler.showSuccess('Audio cargado correctamente');
            } else {
                throw new Error(`Módulo ${moduleId} no encontrado o no soporta audio.`);
            }
        } catch (error) {
            this.errorHandler.showError(new Error(`Error procesando audio: ${error.message}`));
            console.error(error);
        }
    }
    
    async saveState() {
        try {
            const modulesState = Array.from(this.modules.values())
                .map(m => {
                    if (!m || typeof m.getState !== 'function') {
                        console.error('Se ha intentado guardar un módulo inválido:', m);
                        return null;
                    }
                    return m.getState();
                })
                .filter(state => state !== null);
            
            const connectionsState = Array.from(this.connections)
                .map(c => ({
                    sourceId: c.sourceModule.id,
                    sourcePort: c.sourcePortName,
                    destId: c.destModule.id,
                    destPort: c.destPortName,
                }));

            const patch = {
                modules: modulesState,
                connections: connectionsState
            };
            
            const result = await window.api.savePatch(JSON.stringify(patch, null, 2));
            if(result.success) {
                this.errorHandler.showSuccess('Patch guardado');
            } else if (!result.canceled) {
                throw new Error(result.error);
            }
        } catch(e) {
            this.errorHandler.showError(new Error(`No se pudo guardar: ${e.message}`));
            console.error(e);
        }
    }
    
    async loadState() {
        try {
            const result = await window.api.loadPatch();
            if(!result.success || result.canceled) {
                if(result.error) throw new Error(result.error);
                return;
            }
            
            const patch = result.data;
            
            [...this.connections].forEach(c => this.removeConnection(c));
            
            const moduleIdsToDelete = [];
            for (const id of this.modules.keys()) {
                const module = this.modules.get(id);
                if (module && !module.isPermanent) {
                    moduleIdsToDelete.push(id);
                }
            }

            for (const id of moduleIdsToDelete) {
                const moduleToDelete = this.modules.get(id);
                if (typeof moduleToDelete.destroy === 'function') {
                    moduleToDelete.destroy();
                }
                this.modules.delete(id);
            }
            
            const idMap = new Map();

            for (const moduleState of patch.modules) {
                let existingModule = this.getModuleById(moduleState.id);
                let currentId = moduleState.id;

                if (moduleState.type.toLowerCase() === 'keyboard') {
                    existingModule = this.getModuleById('keyboard-main');
                    idMap.set(moduleState.id, 'keyboard-main');
                    currentId = 'keyboard-main';
                } else if (moduleState.type.toLowerCase() === 'speaker') {
                    existingModule = this.getModuleById('speaker-main');
                    idMap.set(moduleState.id, 'speaker-main');
                    currentId = 'speaker-main';
                }

                if (existingModule && existingModule.isPermanent) {
                    existingModule.setState(moduleState);
                } else if (!existingModule) {
                    const newModule = await this.createModule(moduleState.type, moduleState.x, moduleState.y, moduleState);
                    if (newModule) {
                        idMap.set(moduleState.id, newModule.id);
                    }
                }
            }

            for (const connState of patch.connections) {
                const sourceId = idMap.get(connState.sourceId) || connState.sourceId;
                const destId = idMap.get(connState.destId) || connState.destId;

                const sourceModule = this.modules.get(sourceId);
                const destModule = this.modules.get(destId);
                
                if(sourceModule && destModule) {
                    this.addConnection(sourceModule, connState.sourcePort, destModule, connState.destPort);
                } else {
                    console.warn('No se pudo crear conexión, módulo no encontrado:', {
                        ...connState,
                        resolvedSource: sourceId,
                        resolvedDest: destId
                    });
                }
            }

            this.errorHandler.showSuccess('Patch cargado');

        } catch(e) {
            this.errorHandler.showError(new Error(`No se pudo cargar: ${e.message}`));
            console.error(e);
        }
    }
}