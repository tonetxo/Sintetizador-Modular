// modules/visualizations/SpectralAnalyzer.js

/**
 * Dibuja una visualización de barras de espectro.
 * @param {CanvasRenderingContext2D} ctx - El contexto del canvas para dibujar.
 * @param {Uint8Array} dataArray - Los datos de frecuencia del analizador.
 * @param {number} width - El ancho del canvas.
 * @param {number} height - La altura del canvas.
 */
export function drawBars(ctx, dataArray, width, height) {
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    const barWidth = (width / dataArray.length) * 2.5;
    let x = 0;

    for (let i = 0; i < dataArray.length; i++) {
        const barHeight = (dataArray[i] / 255.0) * height;
        // Un color más vibrante que cambia con la altura de la barra
        const hue = 120 + (dataArray[i] / 255.0) * 120; // De verde a azul
        ctx.fillStyle = `hsl(${hue}, 80%, 50%)`;
        ctx.fillRect(x, height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
    }
}
