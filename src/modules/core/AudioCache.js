export class AudioCache {
    constructor() {
        this.cache = new Map();
        this.maxSize = 500 * 1024 * 1024; // 500MB límite
        this.currentSize = 0;
    }

    async addToCache(key, audioBuffer) {
        const size = this._calculateSize(audioBuffer);

        // Hacer espacio si es necesario
        while (this.currentSize + size > this.maxSize && this.cache.size > 0) {
            const oldestKey = this.cache.keys().next().value;
            this.removeFromCache(oldestKey);
        }

        // Almacenar en caché
        this.cache.set(key, {
            buffer: audioBuffer,
            size: size,
            lastAccessed: Date.now()
        });
        this.currentSize += size;
    }

    getFromCache(key) {
        const entry = this.cache.get(key);
        if (entry) {
            entry.lastAccessed = Date.now();
            return entry.buffer;
        }
        return null;
    }

    removeFromCache(key) {
        const entry = this.cache.get(key);
        if (entry) {
            this.currentSize -= entry.size;
            this.cache.delete(key);
        }
    }

    clear() {
        this.cache.clear();
        this.currentSize = 0;
    }

    _calculateSize(audioBuffer) {
        // Calcular tamaño aproximado en bytes
        return audioBuffer.length * audioBuffer.numberOfChannels * 4;
    }

    // Generar clave única para el archivo
    static generateKey(file) {
        return `${file.name}-${file.size}-${file.lastModified}`;
    }
}