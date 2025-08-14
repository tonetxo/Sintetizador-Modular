// worklets/ring-mod-processor.js

class RingModProcessor extends AudioWorkletProcessor {
  process(inputs, outputs) {
    // Obtenemos las dos entradas (señal y modulador) y la salida.
    const signalInput = inputs[0];
    const modulatorInput = inputs[1];
    const output = outputs[0];

    // Nos aseguramos de que ambas entradas estén conectadas.
    // Si falta alguna, la salida será silencio para evitar errores.
    if (signalInput.length === 0 || modulatorInput.length === 0) {
      return true; // Mantenemos el procesador activo.
    }

    // Iteramos sobre cada canal de audio (normalmente estéreo, 2 canales).
    for (let channel = 0; channel < output.length; ++channel) {
      // Usamos el canal correspondiente de cada entrada.
      const signalChannel = signalInput[channel];
      const modulatorChannel = modulatorInput[channel];
      const outputChannel = output[channel];

      // Iteramos sobre cada muestra de audio en el búfer.
      for (let i = 0; i < outputChannel.length; ++i) {
        // --- LA MAGIA DE LA MODULACIÓN EN ANILLO ---
        // Multiplicamos la muestra de la señal por la muestra del modulador.
        outputChannel[i] = signalChannel[i] * modulatorChannel[i];
      }
    }

    // Devolvemos 'true' para indicar que el procesador debe seguir ejecutándose.
    return true;
  }
}

registerProcessor('ring-mod-processor', RingModProcessor);