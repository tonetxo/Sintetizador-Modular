// modules/Sequencer.js
import { audioContext } from './AudioContext.js';

export class Sequencer {
    constructor(x, y, id = null, initialState = {}) {
        this.id = id || `sequencer-${Date.now()}`;
        this.type = 'Sequencer';
        this.type = 'Sequencer';
        this.x = x;
        this.y = y;
        this.width = 500;
        this.height = 320;

        this.params = {
            tempo: initialState.tempo || 120,
            direction: initialState.direction || 0,
            steps: initialState.steps || 16,
            running: initialState.running !== undefined ? initialState.running : false,
            sequence: initialState.sequence || Array(16).fill(0.5),
            gateLengths: initialState.gateLengths || Array(16).fill(0.8),
            stepStates: initialState.stepStates || Array(16).fill(0),
        };
        
        this.directionModes = ['FWD', 'BWD', 'P-P', 'RND'];
        this.hotspots = {};
        this.dragStart = {};
        this.activeControl = null;
        this.currentStep = 0;
        this.lastRunningState = initialState.running !== undefined ? initialState.running : false;
        
        this.onGateOn = null;
        this.onGateOff = null;

        this.inputs = {};
        this.outputs = {};

        console.log(`[Sequencer-${this.id}] Constructor: Initial running state: ${this.params.running}`);
        this.readyPromise = this.initWorklet();
    }

    async initWorklet() {
        console.log(`[Sequencer-${this.id}] Initializing worklet...`);

        this.inputs = {
            'Clock In': { x: 20, y: this.height, type: 'gate', orientation: 'vertical' },
            'Reset In': { x: 60, y: this.height, type: 'gate', orientation: 'vertical' },
            'Direction In': { x: 100, y: this.height, type: 'cv', orientation: 'vertical' },
        };
        this.outputs = {
            'TENSION': { x: this.width, y: this.height - 80, type: 'cv', orientation: 'horizontal' },
            'DISPARO': { x: this.width, y: this.height - 40, type: 'gate', orientation: 'horizontal' },
        };

        try {
            this.workletNode = new AudioWorkletNode(audioContext, 'sequencer-processor', {
                numberOfInputs: 3,
                numberOfOutputs: 2,
                outputChannelCount: [1, 1]
            });
            console.log(`[Sequencer-${this.id}] Worklet node created.`);

            // Keep-alive connection to ensure the process() method is always called
            this.keepAliveNode = audioContext.createGain();
            this.keepAliveNode.gain.value = 0;
            this.workletNode.connect(this.keepAliveNode);
            this.keepAliveNode.connect(audioContext.destination);

            // Connect inputs to the worklet
            this.inputs['Clock In'].target = this.workletNode;
            this.inputs['Clock In'].inputIndex = 0;
            this.inputs['Reset In'].target = this.workletNode;
            this.inputs['Reset In'].inputIndex = 1;
            this.inputs['Direction In'].target = this.workletNode.parameters.get('direction');

            // Assign outputs from the worklet
            this.outputs['TENSION'].source = this.workletNode;
            this.outputs['DISPARO'].source = this.workletNode;
            this.outputs['DISPARO'].port = 1; // Second output

            this.workletNode.port.onmessage = (e) => {
                if (e.data.currentStep !== undefined) {
                    this.currentStep = e.data.currentStep;
                }
                if (e.data.type === 'gateOn') {
                    if (this.onGateOn) this.onGateOn();
                }
                if (e.data.type === 'gateOff') {
                    if (this.onGateOff) this.onGateOff();
                }
            };

            await this.updateWorkletState();
            console.log(`[Sequencer-${this.id}] Worklet initialized and state updated.`);
            return true;
        } catch (error) {
            console.error(`[Sequencer-${this.id}] Error initializing sequencer worklet:`, error);
            throw error;
        }
    }

    async updateWorkletState() {
        // No esperar this.readyPromise aquí, ya que esta función es llamada por initWorklet
        // y también por setState y handleClick, donde readyPromise ya debería estar resuelta.
        if (!this.workletNode) {
            console.warn(`[Sequencer-${this.id}] updateWorkletState called but workletNode is null.`);
            return;
        }

        console.log(`[Sequencer-${this.id}] Updating worklet state. Running: ${this.params.running}`);
        this.workletNode.parameters.get('tempo').setValueAtTime(this.params.tempo, audioContext.currentTime);
        this.workletNode.parameters.get('direction').setValueAtTime(this.params.direction, audioContext.currentTime);
        this.workletNode.parameters.get('steps').setValueAtTime(this.params.steps, audioContext.currentTime);

        // Always send the current running state to the worklet
        if (this.params.running) {
            this.workletNode.port.postMessage({ type: 'start' });
        } else {
            this.workletNode.port.postMessage({ type: 'stop' });
        }
        // Update lastRunningState after sending the message
        this.lastRunningState = this.params.running;

        this.workletNode.port.postMessage({ type: 'updateSequence', sequence: this.params.sequence });
        this.workletNode.port.postMessage({ type: 'updateGateLengths', gateLengths: this.params.gateLengths });
        this.workletNode.port.postMessage({ type: 'updateStepStates', stepStates: this.params.stepStates });
        console.log(`[Sequencer-${this.id}] Worklet state update messages sent.`);
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
        ctx.fillText('SEQUENCER', this.width / 2, 22);

        const stepWidth = 28;
        const stepSpacing = 2;
        for (let i = 0; i < 16; i++) {
            const stepX = 10 + i * (stepWidth + stepSpacing);
            this.drawStep(ctx, i, stepX, 40, stepWidth);
        }
        
        const controlsY = 240;
        this.drawKnob(ctx, 'tempo', 'TEMPO', 50, controlsY, 20, 300, this.params.tempo);
        this.drawButton(ctx, 'run/stop', this.params.running ? 'STOP' : 'START', 120, controlsY, 60, 30);
        this.drawSelector(ctx, 'direction', 'DIR', 210, controlsY, 60, 30, this.directionModes[this.params.direction]);
        this.drawKnob(ctx, 'steps', 'STEPS', 300, controlsY, 1, 16, this.params.steps);

        this.drawConnectors(ctx, hoveredConnectorInfo);
        ctx.restore();
    }

    drawStep(ctx, index, x, y, width) {
        ctx.fillStyle = this.currentStep === index ? '#ff80ab' : '#555';
        ctx.fillRect(x, y, width, 5);

        const cvSliderHeight = 80;
        const cvSliderY = y + 10;
        const cvValue = this.params.sequence[index];
        this.drawVerticalSlider(ctx, `cv-${index}`, x + width / 2, cvSliderY, cvSliderHeight, 0, 1, cvValue);

        const gateSliderHeight = 30;
        const gateSliderY = cvSliderY + cvSliderHeight + 10;
        const gateValue = this.params.gateLengths[index];
        this.drawVerticalSlider(ctx, `gate-${index}`, x + width / 2, gateSliderY, gateSliderHeight, 0.01, 1, gateValue);
        
        const switchY = gateSliderY + gateSliderHeight + 15;
        const state = this.params.stepStates[index];
        ctx.fillStyle = state === 0 ? '#4a90e2' : (state === 1 ? '#777' : '#E0E0E0');
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        const text = state === 0 ? 'ON' : (state === 1 ? 'OFF' : 'SKIP');
        ctx.fillText(text, x + width / 2, switchY);
    }

    drawVerticalSlider(ctx, paramName, x, y, height, minVal, maxVal, currentValue) {
        const knobRadius = 4;
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + height);
        ctx.stroke();

        const normalizedValue = (currentValue - minVal) / (maxVal - minVal);
        const knobY = y + height - (normalizedValue * height);

        ctx.beginPath();
        ctx.arc(x, knobY, knobRadius, 0, Math.PI * 2);
        ctx.fillStyle = this.activeControl === paramName ? '#aaffff' : '#4a90e2';
        ctx.fill();
    }

    drawKnob(ctx, paramName, label, x, y, min, max, value) {
        const knobRadius = 18;
        const angleRange = Math.PI * 1.5;
        const startAngle = Math.PI * 0.75;
        const normalizedValue = (value - min) / (max - min);
        const angle = startAngle + normalizedValue * angleRange;

        ctx.font = '10px Arial';
        ctx.fillStyle = '#E0E0E0';
        ctx.textAlign = 'center';
        ctx.fillText(label, x, y - knobRadius - 5);
        ctx.fillText(paramName === 'steps' ? Math.round(value) : value.toFixed(0), x, y + knobRadius + 12);

        ctx.strokeStyle = '#555';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, knobRadius, startAngle, startAngle + angleRange);
        ctx.stroke();

        ctx.strokeStyle = '#4a90e2';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(angle) * knobRadius, y + Math.sin(angle) * knobRadius);
        ctx.stroke();
        
        this.hotspots[paramName] = { x: x - knobRadius, y: y - knobRadius, width: knobRadius * 2, height: knobRadius * 2, min, max, type: 'knob' };
    }

    drawButton(ctx, paramName, text, x, y, w, h) {
        ctx.fillStyle = this.params.running ? '#4a90e2' : '#777';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#E0E0E0';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x + w / 2, y + h / 2);
        this.hotspots[paramName] = { x, y, width: w, height: h, type: 'button' };
    }

    drawSelector(ctx, paramName, label, x, y, w, h, value) {
        ctx.strokeStyle = '#E0E0E0';
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = '#E0E0E0';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(label, x + w / 2, y - 5);
        ctx.font = 'bold 12px Arial';
        ctx.textBaseline = 'middle';
        ctx.fillText(value, x + w / 2, y + h / 2);
        this.hotspots[paramName] = { x, y, width: w, height: h, type: 'selector' };
    }
    
    drawConnectors(ctx, hovered) {
        const connectorRadius = 8;
        ctx.font = '10px Arial';
        ctx.fillStyle = '#E0E0E0';

        Object.entries(this.inputs).forEach(([name, props]) => {
            const isHovered = hovered && hovered.module === this && hovered.connector.name === name;
            ctx.beginPath();
            ctx.arc(props.x, props.y, connectorRadius, 0, Math.PI * 2);
            ctx.fillStyle = isHovered ? 'white' : '#4a90e2';
            ctx.fill();
            ctx.fillStyle = '#E0E0E0';
            ctx.textAlign = 'center';
            ctx.fillText(name, props.x, props.y + connectorRadius + 12);
        });

        Object.entries(this.outputs).forEach(([name, props]) => {
            const isHovered = hovered && hovered.module === this && hovered.connector.name === name;
            const ox = props.x;
            const oy = props.y;
            ctx.beginPath();
            ctx.arc(ox, oy, connectorRadius, 0, Math.PI * 2);
            ctx.fillStyle = isHovered ? 'white' : '#222';
            ctx.fill();
            ctx.strokeStyle = '#4a90e2';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.fillStyle = '#E0E0E0';
            ctx.textAlign = 'right';
            ctx.fillText(name, ox - connectorRadius - 4, oy + 4);
        });
    }

    checkInteraction(pos) {
        const localPos = { x: pos.x - this.x, y: pos.y - this.y };
        
        for (const [name, spot] of Object.entries(this.hotspots)) {
            if (this.isInside(localPos, spot) && spot.type === 'knob') {
                this.activeControl = name;
                this.dragStart = { y: localPos.y, value: this.params[name] };
                return true;
            }
        }

        const stepWidth = 28;
        const stepSpacing = 2;
        for (let i = 0; i < 16; i++) {
            const stepX = 10 + i * (stepWidth + stepSpacing);
            const cvSliderRect = { x: stepX, y: 50, width: stepWidth, height: 80 };
            if (this.isInside(localPos, cvSliderRect)) {
                this.activeControl = `cv-${i}`;
                return true;
            }
            const gateSliderRect = { x: stepX, y: 140, width: stepWidth, height: 30 };
             if (this.isInside(localPos, gateSliderRect)) {
                this.activeControl = `gate-${i}`;
                return true;
            }
        }
        return false;
    }
    
    isInside(pos, rect) {
        return pos.x >= rect.x && pos.x <= rect.x + rect.width &&
               pos.y >= rect.y && pos.y <= rect.y + rect.height;
    }

    handleDragInteraction(worldPos) {
        if (!this.activeControl) return;
        
        const hotspot = this.hotspots[this.activeControl];
        if (hotspot && hotspot.type === 'knob') {
            const localY = worldPos.y - this.y;
            const dy = this.dragStart.y - localY;
            const range = hotspot.max - hotspot.min;
            const sensitivity = range / 128;
            let newValue = this.dragStart.value + dy * sensitivity;
            newValue = Math.max(hotspot.min, Math.min(hotspot.max, newValue));
            
            if (this.activeControl === 'steps') {
                this.params.steps = Math.round(newValue);
            } else {
                this.params[this.activeControl] = newValue;
            }
            this.updateWorkletState();
            return;
        }
        
        const [type, indexStr] = this.activeControl.split('-');
        const index = parseInt(indexStr, 10);
        const localY = worldPos.y - this.y;

        if (type === 'cv') {
            const rect = { y: 50, height: 80, min: 0, max: 1 };
            let normVal = (rect.y + rect.height - localY) / rect.height;
            normVal = Math.max(0, Math.min(1, normVal));
            this.params.sequence[index] = rect.min + normVal * (rect.max - rect.min);
            if (this.workletNode) this.workletNode.port.postMessage({ type: 'updateSequence', sequence: this.params.sequence });
        } else if (type === 'gate') {
            const rect = { y: 140, height: 30, min: 0.01, max: 1 };
            let normVal = (rect.y + rect.height - localY) / rect.height;
            normVal = Math.max(0, Math.min(1, normVal));
            this.params.gateLengths[index] = rect.min + normVal * (rect.max - rect.min);
            if (this.workletNode) this.workletNode.port.postMessage({ type: 'updateGateLengths', gateLengths: this.params.gateLengths });
        }
    }
    
    handleClick(x, y) {
        const localPos = { x: x - this.x, y: y - this.y };

        for (const [name, spot] of Object.entries(this.hotspots)) {
            if (this.isInside(localPos, spot)) {
                if (spot.type === 'button' && name === 'run/stop') {
                    console.log(`[Sequencer-${this.id}] Run/Stop button clicked. Current running state: ${this.params.running}`);
                    if (audioContext.state === 'suspended') {
                        audioContext.resume();
                        console.log(`[Sequencer-${this.id}] AudioContext resumed.`);
                    }
                    this.params.running = !this.params.running;
                    console.log(`[Sequencer-${this.id}] New running state: ${this.params.running}. Updating worklet state...`);
                    this.updateWorkletState();
                    return true;
                }
                if (spot.type === 'selector' && name === 'direction') {
                    this.params.direction = (this.params.direction + 1) % this.directionModes.length;
                    this.updateWorkletState();
                    return true;
                }
            }
        }

        const stepWidth = 28;
        const stepSpacing = 2;
        const switchY = 185;
        for (let i = 0; i < 16; i++) {
            const stepX = 10 + i * (stepWidth + stepSpacing);
            const switchRect = { x: stepX, y: switchY, width: stepWidth, height: 15 };
            if (this.isInside(localPos, switchRect)) {
                this.params.stepStates[i] = (this.params.stepStates[i] + 1) % 3;
                this.updateWorkletState();
                return true;
            }
        }
        return false;
    }

    endInteraction() {
        this.activeControl = null;
        this.dragStart = {};
    }

    getConnectorAt(x, y) {
        const localX = x - this.x;
        const localY = y - this.y;
        for (const [name, props] of Object.entries(this.inputs)) {
            if (Math.sqrt(Math.pow(localX - props.x, 2) + Math.pow(localY - props.y, 2)) < 9)
                return { name, type: 'input', props, module: this };
        }
        for (const [name, props] of Object.entries(this.outputs)) {
            if (Math.sqrt(Math.pow(localX - props.x, 2) + Math.pow(localY - props.y, 2)) < 9)
                return { name, type: 'output', props, module: this };
        }
        return null;
    }

    

    getState() {
        return {
            id: this.id, type: this.type, x: this.x, y: this.y,
            ...this.params
        };
    }

    async setState(state) {
        this.id = state.id || this.id;
        this.x = state.x;
        this.y = state.y;
        Object.assign(this.params, state);
        await this.updateWorkletState();
    }
}