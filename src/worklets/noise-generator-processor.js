// worklets/noise-generator-processor.js

class NoiseGeneratorProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: 'noiseType',
        defaultValue: 0, // 0: white, 1: pink, 2: random
        minValue: 0,
        maxValue: 2,
        automationRate: 'a-rate'
      }
    ];
  }

  constructor() {
    super();
    // Para el ruido rosa (algoritmo de Voss-McCartney simplificado)
    this.pinkNoiseB0 = 0;
    this.pinkNoiseB1 = 0;
    this.pinkNoiseB2 = 0;
    this.pinkNoiseB3 = 0;
    this.pinkNoiseB4 = 0;
    this.pinkNoiseB5 = 0;
    this.pinkNoiseB6 = 0;

    // Para la tensión aleatoria (sample and hold)
    this.randomValue = 0;
    this.randomCounter = 0;
    // Actualizar el valor aleatorio cada 0.1 segundos (asumiendo 44.1kHz)
    // 44100 muestras/seg * 0.1 seg = 4410 muestras
    this.randomInterval = 4410;
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const noiseType = parameters.noiseType;

    for (let channel = 0; channel < output.length; ++channel) {
      const outputChannel = output[channel];

      for (let i = 0; i < outputChannel.length; ++i) {
        // Obtener el tipo de ruido para la muestra actual
        const type = noiseType.length > 1 ? noiseType[i] : noiseType[0];

        if (type === 0) { // Ruido Blanco
          outputChannel[i] = Math.random() * 2 - 1;
        } else if (type === 1) { // Ruido Rosa (aproximación simplificada)
          // Algoritmo de Voss-McCartney simplificado para ruido rosa
          // Genera ruido blanco y lo filtra para obtener una respuesta de frecuencia de 1/f
          const white = Math.random() * 2 - 1;
          this.pinkNoiseB0 = 0.99886 * this.pinkNoiseB0 + white * 0.0555179;
          this.pinkNoiseB1 = 0.99332 * this.pinkNoiseB1 + white * 0.0750759;
          this.pinkNoiseB2 = 0.96900 * this.pinkNoiseB2 + white * 0.1538520;
          this.pinkNoiseB3 = 0.86650 * this.pinkNoiseB3 + white * 0.3104856;
          this.pinkNoiseB4 = 0.55000 * this.pinkNoiseB4 + white * 0.5329522;
          this.pinkNoiseB5 = -0.7616 * this.pinkNoiseB5 + white * 0.0168980;
          this.pinkNoiseB6 = 0.1159 * this.pinkNoiseB6 + white * 0.11594;
          outputChannel[i] = (this.pinkNoiseB0 + this.pinkNoiseB1 + this.pinkNoiseB2 + this.pinkNoiseB3 + this.pinkNoiseB4 + this.pinkNoiseB5 + this.pinkNoiseB6 + white * 0.5362) * 0.11;
        } else if (type === 2) { // Tensión Aleatoria (Sample and Hold)
          if (this.randomCounter <= 0) {
            this.randomValue = Math.random() * 2 - 1;
            this.randomCounter = this.randomInterval;
          }
          outputChannel[i] = this.randomValue;
          this.randomCounter--;
        }
      }
    }

    return true;
  }
}

registerProcessor('noise-generator-processor', NoiseGeneratorProcessor);