// src/renderer/CanvasManager.js

export class CanvasManager {
    constructor(canvasId, moduleManager) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) throw new Error(`Canvas with id "${canvasId}" not found.`);
        this.ctx = this.canvas.getContext('2d');
        this.moduleManager = moduleManager;

        this.viewOffset = { x: 0, y: 0 };
        this.zoom = 1;
        this.isPanning = false; // Mantenido para el estado del cursor
        this.dragStart = { x: 0, y: 0 };

        this.interaction = { type: 'none', target: null, dragOffset: { x: 0, y: 0 }, connectionStart: null };
        this.mousePos = { x: 0, y: 0 };
        this.worldMousePos = { x: 0, y: 0 };
        this.hoveredConnector = null;
        this.selected = null;
        
        this.keyboardHandler = null;

        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
        this.canvas.addEventListener('mouseleave', this.onMouseUp.bind(this));
        this.canvas.addEventListener('wheel', this.onWheel.bind(this));
        window.addEventListener('keydown', this.onKeyDown.bind(this));
        window.addEventListener('keyup', this.onKeyUp.bind(this));
        // Desactivar el menú contextual nativo del navegador en el canvas
        this.canvas.addEventListener('contextmenu', e => e.preventDefault());

        this.startRendering();
    }
    
    setKeyboardHandler(handler) {
        this.keyboardHandler = handler;
    }
    
    getModuleAt(x, y) {
        for (const module of [...this.moduleManager.modules.values()].reverse()) {
            if (x >= module.x && x <= module.x + module.width &&
                y >= module.y && y <= module.y + module.height) {
                return module;
            }
        }
        return null;
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    updateWorldMousePos(e) {
        this.mousePos = { x: e.clientX, y: e.clientY };
        this.worldMousePos = {
            x: (e.clientX - this.viewOffset.x) / this.zoom,
            y: (e.clientY - this.viewOffset.y) / this.zoom
        };
    }
    
    onKeyDown(e) {
        if (this.keyboardHandler && this.interaction.type === 'none' && !e.repeat) {
            this.keyboardHandler.handleKeyDown(e.key);
        }
        
        if ((e.key === 'Delete' || e.key === 'Backspace')) {
            if (this.selected?.type === 'module' && !this.selected.target.isPermanent) {
                this.moduleManager.deleteModule(this.selected.target.id);
                this.selected = null;
            } else if (this.selected?.type === 'connection') {
                this.moduleManager.removeConnection(this.selected.target);
                this.selected = null;
            }
        }
    }

    onKeyUp(e) {
        if (this.keyboardHandler) {
            this.keyboardHandler.handleKeyUp(e.key);
        }
    }
    
    onWheel(e) {
        e.preventDefault();
        const zoomIntensity = 0.1;
        const wheel = e.deltaY < 0 ? 1 : -1;
        const zoomFactor = Math.exp(wheel * zoomIntensity);
        const newZoom = Math.max(0.2, Math.min(2, this.zoom * zoomFactor));
        const mouseX = e.clientX;
        const mouseY = e.clientY;
        this.viewOffset.x = mouseX - (mouseX - this.viewOffset.x) * (newZoom / this.zoom);
        this.viewOffset.y = mouseY - (mouseY - this.viewOffset.y) * (newZoom / this.zoom);
        this.zoom = newZoom;
    }

    onMouseDown(e) {
        this.updateWorldMousePos(e);

        if (e.button === 2) { // Clic derecho
            const createMenu = document.getElementById('context-menu');
            if (createMenu) createMenu.style.display = 'none';

            const module = this.getModuleAt(this.worldMousePos.x, this.worldMousePos.y);
            if (module && typeof module.toggleBypass === 'function') {
                this.showModuleContextMenu(e.clientX, e.clientY, module);
            }
            return;
        }

        let hitSomething = false;

        if (this.hoveredConnector) {
            this.interaction.type = 'draw_connection';
            this.interaction.connectionStart = this.hoveredConnector;
            hitSomething = true;
            e.stopPropagation();
        }

        if (!hitSomething) {
            const module = this.getModuleAt(this.worldMousePos.x, this.worldMousePos.y);
            if (module) {
                if (module.checkInteraction && module.checkInteraction(this.worldMousePos)) {
                    this.interaction.type = 'drag_control';
                    this.interaction.target = module;
                } else if (module.handleClick?.(this.worldMousePos.x, this.worldMousePos.y)) {
                    this.interaction.type = 'click';
                    this.interaction.target = module;
                } else {
                    this.interaction.type = 'drag_module';
                    this.interaction.target = module;
                    this.interaction.dragOffset.x = this.worldMousePos.x - module.x;
                    this.interaction.dragOffset.y = this.worldMousePos.y - module.y;
                    this.moduleManager.modules.delete(module.id);
                    this.moduleManager.modules.set(module.id, module);
                }
                this.selected = { type: 'module', target: module };
                hitSomething = true;
                e.stopPropagation();
            }
        }
        
        if (!hitSomething) {
            for (const conn of this.moduleManager.connections) {
                if (this.isPointOnConnection(this.worldMousePos, conn)) {
                    this.selected = { type: 'connection', target: conn };
                    hitSomething = true;
                    break;
                }
            }
        }
        
        if (!hitSomething) {
            this.selected = null;
            this.interaction.type = 'pan';
            this.dragStart.x = this.mousePos.x - this.viewOffset.x;
            this.dragStart.y = this.mousePos.y - this.viewOffset.y;
            this.canvas.style.cursor = 'grabbing';
        }
    }

    onMouseMove(e) {
        this.updateWorldMousePos(e);
        if (this.interaction.type === 'pan') {
            this.viewOffset.x = this.mousePos.x - this.dragStart.x;
            this.viewOffset.y = this.mousePos.y - this.dragStart.y;
            return;
        }
        this.hoveredConnector = null;
        if (this.interaction.type !== 'drag_module' && this.interaction.type !== 'drag_control') {
            for (const module of this.moduleManager.modules.values()) {
                const connector = module.getConnectorAt?.(this.worldMousePos.x, this.worldMousePos.y);
                if (connector) { this.hoveredConnector = { module, connector }; break; }
            }
        }
        switch (this.interaction.type) {
            case 'drag_module':
                if (this.interaction.target) {
                    this.interaction.target.x = this.worldMousePos.x - this.interaction.dragOffset.x;
                    this.interaction.target.y = this.worldMousePos.y - this.interaction.dragOffset.y;
                }
                break;
            case 'drag_control':
                if (this.interaction.target?.handleDragInteraction) {
                    this.interaction.target.handleDragInteraction(this.worldMousePos);
                }
                break;
        }
    }

    onMouseUp(e) {
        if (this.interaction.type === 'pan') {
            this.canvas.style.cursor = 'default';
        }

        this.updateWorldMousePos(e);
        if (this.interaction.type === 'draw_connection') {
            const start = this.interaction.connectionStart;
            const end = this.hoveredConnector;
            if (start && end && start.module !== end.module) {
                const source = start.connector.type === 'output' ? start : end;
                const dest = start.connector.type === 'input' ? start : end;
                if (source.connector.type === 'output' && dest.connector.type === 'input') {
                    this.moduleManager.addConnection(source.module, source.connector.name, dest.module, dest.connector.name);
                }
            }
        } 
        else if (this.interaction.type === 'drag_control' && this.interaction.target) {
            this.interaction.target.endInteraction?.();
        }
        
        this.interaction.type = 'none';
        this.interaction.target = null;
        this.interaction.connectionStart = null;
    }

    showModuleContextMenu(x, y, module) {
        let menu = document.getElementById('module-context-menu');
        if (menu) menu.remove();

        menu = document.createElement('div');
        menu.id = 'module-context-menu';
        menu.className = 'context-menu';
        
        const bypassText = module.bypassed ? 'Activate' : 'Bypass';
        menu.innerHTML = `<div class="context-menu-item" data-action="toggle-bypass">${bypassText}</div>`;
        
        if (!module.isPermanent) {
            menu.innerHTML += `<div class="context-menu-item" data-action="delete">Delete Module</div>`;
        }

        document.body.appendChild(menu);
        menu.style.display = 'block';
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;

        const clickHandler = (e) => {
            const action = e.target.dataset.action;
            if (action === 'toggle-bypass') {
                module.toggleBypass();
            } else if (action === 'delete') {
                this.moduleManager.deleteModule(module.id);
            }
            menu.remove();
            document.removeEventListener('click', clickHandler);
            document.removeEventListener('contextmenu', contextHandler, true);
        };
        const contextHandler = (e) => {
            e.preventDefault();
            menu.remove();
            document.removeEventListener('click', clickHandler);
            document.removeEventListener('contextmenu', contextHandler, true);
        };

        setTimeout(() => {
            document.addEventListener('click', clickHandler, { once: true });
            document.addEventListener('contextmenu', contextHandler, { once: true, capture: true });
        }, 0);
    }

    startRendering() {
        const render = () => {
            requestAnimationFrame(render);
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.save();
            this.ctx.translate(this.viewOffset.x, this.viewOffset.y);
            this.ctx.scale(this.zoom, this.zoom);

            const colors = {
                audio: '#4a90e2',
                cv: '#f5a623',
                gate: '#f5a623',
                default: '#dddddd'
            };

            this.moduleManager.connections.forEach(conn => {
                const isSelected = this.selected?.type === 'connection' && this.selected.target.id === conn.id;
                const color = isSelected ? '#ff4444' : (colors[conn.type] || colors.default);
                this.drawConnection(conn, color);
            });

            if (this.interaction.type === 'draw_connection' && this.interaction.connectionStart) {
                const start = this.interaction.connectionStart;
                this.drawConnection({
                    sourceModule: start.module,
                    sourcePortName: start.connector.name,
                    endPoint: this.worldMousePos
                }, '#aaffff');
            }

            for (const module of this.moduleManager.modules.values()) {
                if (typeof module.draw === 'function') {
                    const isSelected = this.selected?.type === 'module' && this.selected.target === module;
                    module.draw(this.ctx, isSelected, this.hoveredConnector);
                }
            }
            this.ctx.restore();
        };
        render();
    }
    
    drawConnection(connection, color) {
        const points = this.getConnectionPoints(connection);
        if (!points) return;
        const { p0, p1, p2, p3 } = points;

        this.ctx.beginPath();
        this.ctx.moveTo(p0.x, p0.y);
        this.ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 3 / this.zoom;
        this.ctx.stroke();
    }

    isPointOnConnection(point, conn) {
        const points = this.getConnectionPoints(conn);
        if (!points) return false;
        const threshold = 10 / this.zoom;
        const steps = 20;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const p = this.getPointOnBezier(t, points);
            const distance = Math.hypot(point.x - p.x, point.y - p.y);
            if (distance < threshold) {
                return true;
            }
        }
        return false;
    }

    getConnectionPoints(connection) {
        const { sourceModule, sourcePortName, destModule, destPortName, endPoint: mousePoint } = connection;
        const sourcePort = sourceModule.outputs[sourcePortName];
        if (!sourcePort) return null;
        const p0 = { x: sourceModule.x + sourcePort.x, y: sourceModule.y + sourcePort.y };
        let p3, destPort;
        if (mousePoint) {
            p3 = mousePoint;
        } else if (destModule && destPortName) {
            destPort = destModule.inputs[destPortName];
            if (!destPort) return null;
            p3 = { x: destModule.x + destPort.x, y: destModule.y + destPort.y };
        } else {
            return null;
        }
        const handleLength = Math.min(60, Math.hypot(p3.x - p0.x, p3.y - p0.y) * 0.4);
        let p1 = { ...p0 };
        if (sourcePort.x <= 0) p1.x -= handleLength;
        else if (sourcePort.x >= sourceModule.width) p1.x += handleLength;
        else if (sourcePort.y <= 0) p1.y -= handleLength;
        else if (sourcePort.y >= sourceModule.height) p1.y += handleLength;
        else p1.x += handleLength;
        let p2 = { ...p3 };
        if (destPort) {
            if (destPort.x <= 0) p2.x -= handleLength;
            else if (destPort.x >= destModule.width) p2.x += handleLength;
            else if (destPort.y <= 0) p2.y -= handleLength;
            else if (destPort.y >= destModule.height) p2.y += handleLength;
            else p2.x -= handleLength;
        } else {
            p2.x += (p3.x > p0.x ? -handleLength : handleLength);
        }
        return { p0, p1, p2, p3 };
    }

    getPointOnBezier(t, {p0, p1, p2, p3}) {
        const c = (1 - t);
        const c2 = c * c;
        const c3 = c2 * c;
        const t2 = t * t;
        const t3 = t2 * t;
        const x = c3*p0.x + 3*c2*t*p1.x + 3*c*t2*p2.x + t3*p3.x;
        const y = c3*p0.y + 3*c2*t*p1.y + 3*c*t2*p2.y + t3*p3.y;
        return {x, y};
    }
}