// modules/visualizations/NeonDNA.js

/**
 * Dibuja una doble hélice de neón que reacciona a la música.
 * @param {CanvasRenderingContext2D} ctx - El contexto del canvas para dibujar.
 * @param {Uint8Array} dataArray - Los datos de frecuencia del analizador.
 * @param {number} width - El ancho del canvas.
 * @param {number} height - La altura del canvas.
 */
export function drawNeonDNA(ctx, dataArray, width, height) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'; // Fondo con desvanecimiento lento
    ctx.fillRect(0, 0, width, height);

    const bufferLength = dataArray.length;
    
    // Análisis de frecuencia simplificado
    const bass = dataArray[Math.floor(bufferLength * 0.05)] / 255;
    const mids = dataArray[Math.floor(bufferLength * 0.3)] / 255;
    const treble = dataArray[Math.floor(bufferLength * 0.7)] / 255;
    
    const amplitude = height / 4 + (bass * height / 4);
    const twistSpeed = 5 + (mids * 10);
    const time = Date.now() / 1000 * twistSpeed;

    // Dibujar las dos hebras
    for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        const phase = i * Math.PI; // Desfase de 180 grados para la segunda hebra
        ctx.strokeStyle = i === 0 ? 'rgba(0, 255, 255, 0.8)' : 'rgba(255, 0, 255, 0.8)';
        ctx.lineWidth = 2 + bass * 5;

        // Efecto de brillo
        ctx.shadowBlur = 15 + bass * 15;
        ctx.shadowColor = i === 0 ? 'cyan' : 'magenta';

        for (let x = 0; x < width; x++) {
            const angle = (x / width) * 20 + time;
            const y = height / 2 + Math.sin(angle + phase) * amplitude;
            if (x === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
    }
    
    // Dibujar "chispas" en las zonas de agudos
    if (treble > 0.5) {
        for (let i = 0; i < Math.floor(treble * 30); i++) {
            const x = Math.random() * width;
            const angle = (x / width) * 20 + time;
            const y = height / 2 + Math.sin(angle + (Math.random() > 0.5 ? Math.PI : 0)) * amplitude;
            
            ctx.fillStyle = 'white';
            ctx.shadowBlur = 20;
            ctx.shadowColor = 'white';
            ctx.beginPath();
            ctx.arc(x, y, Math.random() * 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    ctx.shadowBlur = 0;
}
