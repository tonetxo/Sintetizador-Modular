// modules/visualizations/StardustField.js

// Almacenar estrellas entre frames
let stars = [];
const NUM_STARS = 500;

function initStars(width, height) {
    if (stars.length === 0) {
        for (let i = 0; i < NUM_STARS; i++) {
            stars.push({
                x: (Math.random() - 0.5) * width,
                y: (Math.random() - 0.5) * height,
                z: Math.random() * width,
                colorHue: 180 + Math.random() * 60 // Tonos cian y azules
            });
        }
    }
}

/**
 * Dibuja un campo de estrellas 3D reactivo.
 * @param {CanvasRenderingContext2D} ctx - El contexto del canvas.
 * @param {Uint8Array} dataArray - Los datos de frecuencia del analizador.
 * @param {number} width - El ancho del canvas.
 * @param {number} height - La altura del canvas.
 */
export function drawStardustField(ctx, dataArray, width, height) {
    initStars(width, height);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'; // Fondo con desvanecimiento
    ctx.fillRect(0, 0, width, height);

    const bass = dataArray[Math.floor(dataArray.length * 0.02)] / 255;
    const treble = dataArray[Math.floor(dataArray.length * 0.8)] / 255;

    const speed = 1 + bass * 20; // El bajo controla la velocidad de avance

    ctx.save();
    ctx.translate(width / 2, height / 2); // Centrar el origen

    stars.forEach(star => {
        // Mover la estrella hacia el espectador
        star.z -= speed;

        // Si la estrella se sale de la pantalla, la reiniciamos al fondo
        if (star.z <= 0) {
            star.x = (Math.random() - 0.5) * width;
            star.y = (Math.random() - 0.5) * height;
            star.z = width;
        }

        // Proyección 3D simple
        const k = 128 / star.z;
        const px = star.x * k;
        const py = star.y * k;
        const radius = (1 - star.z / width) * 3 * (1 + treble);

        if (radius > 0.1) {
            ctx.beginPath();
            const alpha = 1 - (star.z / width);
            ctx.fillStyle = `hsla(${star.colorHue}, 100%, ${70 + treble * 30}%, ${alpha})`;
            ctx.arc(px, py, radius, 0, Math.PI * 2);
            ctx.fill();
        }
    });

    ctx.restore();
}
