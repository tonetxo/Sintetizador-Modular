// modules/Phaser.js
import { audioContext } from './AudioContext.js';
import { BaseEffect } from './BaseEffect.js';

export class Phaser extends BaseEffect {
    constructor(x, y, id = null, initialState = {}) {
        super(x, y, 'Phaser', 200, 220, id, initialState);
        this.processorName = 'phaser-processor';
        this.knobDefs = [
            { name: 'rate', label: 'Rate', min: 0.1, max: 8, initial: 0.5, logarithmic: true },
            { name: 'depth', label: 'Depth', min: 100, max: 1500, initial: 600 },
            { name: 'frequency', label: 'Frequency', min: 200, max: 5000, initial: 800, logarithmic: true },
            { name: 'feedback', label: 'Feedback', min: 0, max: 0.98, initial: 0.7 }
        ];
        
        this.stages = initialState.stages || 4;
        this.stageOptions = [2, 4, 6, 8, 10, 12];

        this.readyPromise = this.init().then(() => {
            this.addStageSelector();
        });
    }

    addStageSelector() {
        const selectorSpot = {
            x: this.width / 2 - 40, y: this.height - 30, width: 80, height: 20,
            type: 'selector',
            callback: () => {
                const currentIndex = this.stageOptions.indexOf(this.stages);
                const nextIndex = (currentIndex + 1) % this.stageOptions.length;
                this.stages = this.stageOptions[nextIndex];
                if (this.workletNode) {
                    this.workletNode.port.postMessage({ type: 'stages', value: this.stages });
                }
            }
        };
        this.extraHotspots['stages'] = selectorSpot;
    }

    draw(ctx, isSelected, hoveredConnectorInfo) {
        super.draw(ctx, isSelected, hoveredConnectorInfo);
        // Draw stages display
        ctx.save();
        ctx.translate(this.x, this.y);
        const spot = this.extraHotspots['stages'];
        if (spot) {
            ctx.fillStyle = '#333';
            ctx.strokeStyle = '#888';
            ctx.lineWidth = 1;
            ctx.fillRect(spot.x, spot.y, spot.width, spot.height);
            ctx.strokeRect(spot.x, spot.y, spot.width, spot.height);
            
            ctx.fillStyle = '#E0E0E0';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`Stages: ${this.stages}`, spot.x + spot.width / 2, spot.y + spot.height / 2);
        }
        ctx.restore();
    }

    getState() {
        const baseState = super.getState();
        return { ...baseState, stages: this.stages };
    }

    setState(state) {
        super.setState(state);
        if (state.stages && this.workletNode) {
            this.stages = state.stages;
            this.workletNode.port.postMessage({ type: 'stages', value: this.stages });
        }
    }
}
