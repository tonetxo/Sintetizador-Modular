export class HistoryManager {
    constructor() {
        this.undoStack = [];
        this.redoStack = [];
        this.maxHistory = 50; // Límite de acciones guardadas
    }

    pushAction(action) {
        this.undoStack.push(action);
        this.redoStack = []; // Limpiar redo al añadir nueva acción

        // Mantener el límite de historia
        if (this.undoStack.length > this.maxHistory) {
            this.undoStack.shift();
        }
    }

    undo() {
        if (this.undoStack.length > 0) {
            const action = this.undoStack.pop();
            this.redoStack.push(action.inverse());
            action.undo();
        }
    }

    redo() {
        if (this.redoStack.length > 0) {
            const action = this.redoStack.pop();
            this.undoStack.push(action.inverse());
            action.redo();
        }
    }

    clear() {
        this.undoStack = [];
        this.redoStack = [];
    }
}

// Clases de acciones
export class ModuleAction {
    constructor(moduleManager, moduleData, type) {
        this.moduleManager = moduleManager;
        this.moduleData = moduleData;
        this.type = type;
    }

    inverse() {
        return new ModuleAction(
            this.moduleManager,
            this.moduleData,
            this.type === 'create' ? 'delete' : 'create'
        );
    }

    undo() {
        if (this.type === 'create') {
            this.moduleManager.removeModule(this.moduleData.id);
        } else {
            this.moduleManager.recreateModule(this.moduleData);
        }
    }

    redo() {
        this.inverse().undo();
    }
}

export class ParameterAction {
    constructor(module, parameter, oldValue, newValue) {
        this.module = module;
        this.parameter = parameter;
        this.oldValue = oldValue;
        this.newValue = newValue;
    }

    inverse() {
        return new ParameterAction(
            this.module,
            this.parameter,
            this.newValue,
            this.oldValue
        );
    }

    undo() {
        this.module.setParameter(this.parameter, this.oldValue);
    }

    redo() {
        this.module.setParameter(this.parameter, this.newValue);
    }
}

export class ConnectionAction {
    constructor(moduleManager, connection, type) {
        this.moduleManager = moduleManager;
        this.connection = connection;
        this.type = type;
    }

    inverse() {
        return new ConnectionAction(
            this.moduleManager,
            this.connection,
            this.type === 'connect' ? 'disconnect' : 'connect'
        );
    }

    undo() {
        if (this.type === 'connect') {
            this.moduleManager.removeConnection(this.connection);
        } else {
            this.moduleManager.addConnection(
                this.connection.source,
                this.connection.sourcePort,
                this.connection.target,
                this.connection.targetPort
            );
        }
    }

    redo() {
        this.inverse().undo();
    }
}