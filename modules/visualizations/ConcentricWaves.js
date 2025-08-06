// modules/visualizations/ConcentricWaves.js

/**
 * Dibuja la visualización de "Ondas Concéntricas" mejorada.
 * @param {CanvasRenderingContext2D} ctx - El contexto del canvas para dibujar.
 * @param {Uint8Array} dataArray - Los datos de frecuencia del analizador.
 * @param {number} width - El ancho del canvas.
 * @param {number} height - La altura del canvas.
 */
export function drawConcentricWaves(ctx, dataArray, width, height) {
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    const bufferLength = dataArray.length;

    // 1. Calcular energía por bandas y RMS (intensidad)
    const lowFreqBandEnd = Math.floor(bufferLength * 0.1);
    let lowEnergy = 0;
    let highEnergy = 0;
    let totalEnergy = 0;
    let weightedSum = 0;
    let totalWeight = 0;

    for (let i = 0; i < bufferLength; i++) {
        const value = dataArray[i];
        if (value === 0) continue;
        
        const squaredValue = value * value;
        totalEnergy += squaredValue;
        
        weightedSum += i * value;
        totalWeight += value;

        if (i < lowFreqBandEnd) {
            lowEnergy += squaredValue;
        } else {
            highEnergy += squaredValue;
        }
    }

    if (totalWeight === 0 || totalEnergy === 0) {
        ctx.shadowBlur = 0; // Asegúrate de limpiar la sombra si no hay sonido
        return; // Salir si hay silencio
    }

    const rms = Math.sqrt(totalEnergy / totalWeight) / 255; // Normalizado a 0-1
    if (rms < 0.01) {
        ctx.shadowBlur = 0;
        return; // Umbral de silencio
    }

    const normalizedLow = lowEnergy / totalEnergy;
    const normalizedHigh = highEnergy / totalEnergy;
    const averageIndex = weightedSum / totalWeight;

    // 2. Mapear audio a parámetros visuales
    const hue = (averageIndex / bufferLength) * 360; 
    const originX = width * 0.1 + (averageIndex / bufferLength) * (width * 0.8);
    const originY = height - (rms * height * 0.8);
    const numCircles = 2 + Math.floor(rms * 15);
    const maxRadius = 10 + (rms * width * 0.3) + (normalizedLow * width * 0.2);
    const lineWidth = Math.max(1, 1 + (normalizedHigh * 10));

    ctx.shadowBlur = rms * 30;
    ctx.shadowColor = `hsla(${hue}, 100%, 70%, 0.7)`;

    // 3. Dibujar los círculos
    for (let i = 1; i <= numCircles; i++) {
        const radius = (i / numCircles) * maxRadius;
        const alpha = 1 - (i / numCircles);

        ctx.strokeStyle = `hsla(${hue}, 100%, 60%, ${alpha * 0.8})`;
        ctx.fillStyle = `hsla(${hue}, 100%, 50%, ${alpha * 0.05})`;
        ctx.lineWidth = lineWidth;

        ctx.beginPath();
        ctx.arc(originX, originY, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fill();
    }
    
    ctx.shadowBlur = 0; // Resetear la sombra para el siguiente frame
}
