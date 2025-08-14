// src/modules/mixing/Mixer.js

export class Mixer {
    constructor(audioContext, x, y, id = null, initialState = {}) {
        this.audioContext = audioContext;
        this.id = id || `mixer-${Date.now()}`;
        this.x = x;
        this.y = y;
        this.width = 400;
        this.height = 350;
        this.type = 'Mixer';

        this.channels = 8;
        this.channelStrips = [];
        this.activeControl = null;
        this.paramHotspots = {};
        this.dragStart = {};

        this.masterOutput = this.audioContext.createGain();
        this.masterAnalyser = this.audioContext.createAnalyser();
        this.masterOutput.connect(this.masterAnalyser);

        this.setupChannels();

        this.compressor = this.audioContext.createDynamicsCompressor();
        this.masterOutput.connect(this.compressor);

        this.parameters = {
            masterVolume: 1,
        };

        this.setupPorts();
    }

    setupChannels() {
        for (let i = 0; i < this.channels; i++) {
            const channel = {
                input: this.audioContext.createGain(),
                output: this.audioContext.createGain(),
                panner: this.audioContext.createStereoPanner(),
                analyser: this.audioContext.createAnalyser(),
                mute: false,
                solo: false,
                params: { gain: 0.75, pan: 0 } // Default gain to a reasonable level
            };
            channel.output.gain.value = channel.params.gain;

            channel.input.connect(channel.panner);
            channel.panner.connect(channel.output);
            channel.output.connect(this.masterOutput);
            channel.output.connect(channel.analyser);
            this.channelStrips.push(channel);
        }
    }

    setupPorts() {
        this.inputs = {};
        this.outputs = {
            'Master Out': { x: this.width, y: this.height / 2, type: 'audio', source: this.compressor }
        };
        this.channelStrips.forEach((channel, i) => {
            const yPos = 40 + i * (300 / this.channels);
            this.inputs[`In ${i + 1}`] = { x: 0, y: yPos, type: 'audio', target: channel.input };
        });
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
        ctx.fillText('MIXER 8-CH', this.width / 2, 22);

        const channelWidth = this.width / (this.channels + 1);
        this.channelStrips.forEach((ch, i) => {
            const xPos = channelWidth * (i + 0.8);
            this.drawChannelStrip(ctx, ch, i, xPos, 40);
        });

        this.drawConnectors(ctx, hoveredConnectorInfo);
        ctx.restore();
    }

    drawChannelStrip(ctx, channel, index, x, y) {
        ctx.font = '10px Arial';
        ctx.fillStyle = '#E0E0E0';
        ctx.textAlign = 'center';
        ctx.fillText(`CH ${index + 1}`, x, y);
        this.drawVerticalSlider(ctx, `gain-${index}`, x, y + 15, 200, 0, 1, channel.params.gain);
    }
    
    drawVerticalSlider(ctx, paramName, x, y, height, minVal, maxVal, currentValue) {
        const knobRadius = 8;
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 4;
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
        this.paramHotspots[paramName] = { x: x - knobRadius, y: y, width: knobRadius * 2, height: height, min: minVal, max: maxVal };
    }

    drawConnectors(ctx, hovered) {
        const connectorRadius = 8;
        ctx.font = '10px Arial';
        Object.entries(this.inputs).forEach(([name, props]) => {
            const ix = props.x, iy = props.y;
            const isHovered = hovered?.module === this && hovered.connector?.name === name;
            ctx.beginPath();
            ctx.arc(ix, iy, connectorRadius, 0, Math.PI * 2);
            ctx.fillStyle = isHovered ? 'white' : '#4a90e2';
            ctx.fill();
            ctx.fillStyle = '#E0E0E0';
            ctx.textAlign = 'left';
            ctx.fillText(name, ix + connectorRadius + 4, iy + 4);
        });
        Object.entries(this.outputs).forEach(([name, props]) => {
            const ox = props.x, oy = props.y;
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
            ctx.fillText(name, ox - connectorRadius - 4, oy + 4);
        });
    }
    
    checkInteraction(pos) {
        const localPos = { x: pos.x - this.x, y: pos.y - this.y };
        for (const [param, rect] of Object.entries(this.paramHotspots)) {
            if (localPos.x >= rect.x && localPos.x <= rect.x + rect.width &&
                localPos.y >= rect.y && localPos.y <= rect.y + rect.height) {
                this.activeControl = param;
                const [type, indexStr] = param.split('-');
                const index = parseInt(indexStr, 10);
                this.dragStart = { y: pos.y, value: this.channelStrips[index].params[type] };
                return true;
            }
        }
        return false;
    }

    handleDragInteraction(worldPos) {
        if (!this.activeControl) return;
        const sliderRect = this.paramHotspots[this.activeControl];
        const localY = worldPos.y - this.y;
        let normVal = (sliderRect.y + sliderRect.height - localY) / sliderRect.height;
        normVal = Math.max(0, Math.min(1, normVal));
        const newValue = sliderRect.min + normVal * (sliderRect.max - sliderRect.min);

        const [type, indexStr] = this.activeControl.split('-');
        const index = parseInt(indexStr, 10);
        this.channelStrips[index].params[type] = newValue;
        
        const targetParam = this.channelStrips[index].output.gain;
        targetParam.setTargetAtTime(newValue, this.audioContext.currentTime, 0.01);
    }

    endInteraction() { this.activeControl = null; }

    getConnectorAt(x, y) {
        const localX = x - this.x;
        const localY = y - this.y;
        for (const [name, props] of Object.entries(this.inputs)) {
            if (Math.hypot(localX - props.x, localY - props.y) < 9) return { name, type: 'input', props, module: this };
        }
        for (const [name, props] of Object.entries(this.outputs)) {
            if (Math.hypot(localX - props.x, localY - props.y) < 9) return { name, type: 'output', props, module: this };
        }
        return null;
    }
    
    destroy() {
        this.channelStrips.forEach(ch => {
            ch.input.disconnect();
            ch.output.disconnect();
            ch.panner.disconnect();
            ch.analyser.disconnect();
        });
        this.masterOutput.disconnect();
        this.masterAnalyser.disconnect();
        this.compressor.disconnect();
    }
    
    getState() {
        const state = { id: this.id, type: this.type, x: this.x, y: this.y };
        this.channelStrips.forEach((ch, i) => {
            state[`gain-${i}`] = ch.params.gain;
        });
        return state;
    }

    setState(state) {
        this.id = state.id || this.id;
        this.x = state.x ?? this.x;
        this.y = state.y ?? this.y;
        this.channelStrips.forEach((ch, i) => {
            if (state[`gain-${i}`] !== undefined) {
                ch.params.gain = state[`gain-${i}`];
                ch.output.gain.setValueAtTime(ch.params.gain, this.audioContext.currentTime);
            }
        });
    }
}