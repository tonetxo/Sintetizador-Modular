// modules/visualizations/LavaLamp.js

// Almacenamos las "gotas" de lava entre frames
let blobs = [];
const NUM_BLOBS = 8; // Número de gotas en la lámpara

// Inicializar las gotas si no existen
function initBlobs(width, height) {
    if (blobs.length === 0) {
        for (let i = 0; i < NUM_BLOBS; i++) {
            blobs.push({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 2,
                vy: (Math.random() - 0.5) * 2,
                radius: 20 + Math.random() * 30,
                colorHue: 280 + Math.random() * 80 // Tonos púrpuras y rosas
            });
        }
    }
}

/**
 * Dibuja una visualización hipnótica de lámpara de lava.
 * @param {CanvasRenderingContext2D} ctx - El contexto del canvas.
 * @param {Uint8Array} dataArray - Los datos de frecuencia del analizador.
 * @param {number} width - El ancho del canvas.
 * @param {number} height - La altura del canvas.
 */
export function drawLavaLamp(ctx, dataArray, width, height) {
    initBlobs(width, height);

    ctx.fillStyle = '#050210'; // Fondo azul muy oscuro
    ctx.fillRect(0, 0, width, height);

    const bass = dataArray[Math.floor(dataArray.length * 0.05)] / 255;
    const mids = dataArray[Math.floor(dataArray.length * 0.4)] / 255;

    // Actualizar y dibujar cada gota
    blobs.forEach(blob => {
        // Mover la gota
        blob.x += blob.vx * (1 + mids * 2);
        blob.y += blob.vy * (1 + mids * 2);

        // Rebotar en los bordes
        if (blob.x < blob.radius || blob.x > width - blob.radius) blob.vx *= -1;
        if (blob.y < blob.radius || blob.y > height - blob.radius) blob.vy *= -1;

        // El bajo afecta el tamaño de la gota
        const currentRadius = blob.radius * (1 + bass * 1.5);

        // Dibujar la gota con un gradiente radial para darle volumen
        const gradient = ctx.createRadialGradient(blob.x, blob.y, 0, blob.x, blob.y, currentRadius);
        gradient.addColorStop(0, `hsla(${blob.colorHue}, 100%, 70%, 0.8)`);
        gradient.addColorStop(0.8, `hsla(${blob.colorHue}, 100%, 50%, 0.4)`);
        gradient.addColorStop(1, `hsla(${blob.colorHue}, 100%, 50%, 0)`);

        ctx.fillStyle = gradient;
        ctx.shadowColor = `hsl(${blob.colorHue}, 100%, 70%)`;
        ctx.shadowBlur = 30;

        ctx.beginPath();
        ctx.arc(blob.x, blob.y, currentRadius, 0, Math.PI * 2);
        ctx.fill();
    });

    ctx.shadowBlur = 0; // Limpiar sombra para el siguiente frame
}
