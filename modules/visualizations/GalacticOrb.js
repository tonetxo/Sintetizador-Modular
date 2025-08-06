// modules/visualizations/GalacticOrb.js

// Almacenar partículas entre frames
let particles = [];

/**
 * Dibuja un orbe central que emite partículas como una estrella.
 * @param {CanvasRenderingContext2D} ctx - El contexto del canvas para dibujar.
 * @param {Uint8Array} dataArray - Los datos de frecuencia del analizador.
 * @param {number} width - El ancho del canvas.
 * @param {number} height - La altura del canvas.
 */
export function drawGalacticOrb(ctx, dataArray, width, height) {
    ctx.fillStyle = 'rgba(10, 5, 20, 0.2)'; // Fondo espacial con desvanecimiento
    ctx.fillRect(0, 0, width, height);
    
    const bufferLength = dataArray.length;
    let totalEnergy = 0;
    let weightedSum = 0;
    let totalWeight = 0;

    for (let i = 0; i < bufferLength; i++) {
        const value = dataArray[i];
        totalEnergy += value * value;
        weightedSum += i * value;
        totalWeight += value;
    }

    const rms = totalWeight > 0 ? Math.sqrt(totalEnergy / totalWeight) / 255 : 0;
    const averageIndex = totalWeight > 0 ? weightedSum / totalWeight : 0;
    const bass = dataArray[Math.floor(bufferLength * 0.05)] / 255;
    const treble = dataArray[Math.floor(bufferLength * 0.7)] / 255;

    // Mapeo de tono a color
    const hue = 200 + (averageIndex / bufferLength) * 160; // De azul a magenta y rojo
    
    // 1. Dibujar el orbe central
    const centerX = width / 2;
    const centerY = height / 2;
    const orbRadius = 20 + bass * 80 + rms * 20;

    // Aura exterior
    const auraGradient = ctx.createRadialGradient(centerX, centerY, orbRadius * 0.8, centerX, centerY, orbRadius * 2);
    auraGradient.addColorStop(0, `hsla(${hue}, 100%, 70%, ${0.1 + rms * 0.3})`);
    auraGradient.addColorStop(1, `hsla(${hue}, 100%, 70%, 0)`);
    ctx.fillStyle = auraGradient;
    ctx.fillRect(0, 0, width, height);

    // Núcleo del orbe
    const orbGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, orbRadius);
    orbGradient.addColorStop(0, `hsla(${hue}, 100%, 90%, 1)`);
    orbGradient.addColorStop(0.5, `hsla(${hue}, 100%, 70%, 0.8)`);
    orbGradient.addColorStop(1, `hsla(${hue}, 100%, 50%, 0)`);
    ctx.fillStyle = orbGradient;
    ctx.shadowBlur = 30;
    ctx.shadowColor = `hsl(${hue}, 100%, 70%)`;
    ctx.beginPath();
    ctx.arc(centerX, centerY, orbRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    
    // 2. Crear y gestionar partículas
    if (treble > 0.4) {
        const particleCount = Math.floor(treble * 5);
        for (let i = 0; i < particleCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 4;
            particles.push({
                x: centerX + Math.cos(angle) * orbRadius,
                y: centerY + Math.sin(angle) * orbRadius,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 100,
                hue: hue + Math.random() * 40 - 20,
            });
        }
    }

    // 3. Actualizar y dibujar partículas
    particles.forEach((p, index) => {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 1;

        if (p.life <= 0) {
            particles.splice(index, 1);
        } else {
            ctx.fillStyle = `hsla(${p.hue}, 100%, 80%, ${p.life / 100})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    });
}
