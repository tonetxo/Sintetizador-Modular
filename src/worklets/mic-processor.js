// worklets/mic-processor.js

class MicProcessor extends AudioWorkletProcessor {
  process(inputs, outputs) {
    // Tomamos la primera entrada (el micrófono)
    const input = inputs[0];
    // Y la primera salida
    const output = outputs[0];

    // Si hay entrada, la copiamos directamente a la salida, canal por canal.
    if (input && input.length > 0) {
      for (let channel = 0; channel < input.length; ++channel) {
        if (output[channel]) {
          output[channel].set(input[channel]);
        }
      }
    }

    // Devolvemos true para mantener el procesador activo.
    return true;
  }
}

registerProcessor('mic-processor', MicProcessor);
