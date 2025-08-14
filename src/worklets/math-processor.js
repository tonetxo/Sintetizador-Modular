// worklets/math-processor.js

class MathProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            {
                name: 'operation',
                defaultValue: 0, // 0: Add, 1: Subtract, 2: Multiply, 3: Min, 4: Max
                minValue: 0,
                maxValue: 4,
                automationRate: 'k-rate'
            },
            {
                name: 'levelA',
                defaultValue: 1,
                minValue: -2,
                maxValue: 2,
                automationRate: 'a-rate'
            },
            {
                name: 'levelB',
                defaultValue: 1,
                minValue: -2,
                maxValue: 2,
                automationRate: 'a-rate'
            }
        ];
    }

    process(inputs, outputs, parameters) {
        const inputA = inputs[0];
        const inputB = inputs[1];
        const output = outputs[0];
        const operation = parameters.operation[0];
        const levelA = parameters.levelA;
        const levelB = parameters.levelB;

        // Iterar sobre cada canal (aunque normalmente usaremos mono)
        for (let channel = 0; channel < output.length; ++channel) {
            const outputChannel = output[channel];
            const inputChannelA = inputA[channel] || inputA[0];
            const inputChannelB = inputB[channel] || inputB[0];

            // Iterar sobre cada muestra en el bloque de procesamiento
            for (let i = 0; i < outputChannel.length; ++i) {
                const currentLevelA = levelA.length > 1 ? levelA[i] : levelA[0];
                const currentLevelB = levelB.length > 1 ? levelB[i] : levelB[0];

                const a = (inputChannelA ? inputChannelA[i] : 0) * currentLevelA;
                const b = (inputChannelB ? inputChannelB[i] : 0) * currentLevelB;

                switch (operation) {
                    case 0: // Suma (A + B)
                        outputChannel[i] = a + b;
                        break;
                    case 1: // Resta (A - B)
                        outputChannel[i] = a - b;
                        break;
                    case 2: // Multiplicación (A * B)
                        outputChannel[i] = a * b;
                        break;
                    case 3: // Mínimo (MIN(A, B))
                        outputChannel[i] = Math.min(a, b);
                        break;
                    case 4: // Máximo (MAX(A, B))
                        outputChannel[i] = Math.max(a, b);
                        break;
                    default:
                        outputChannel[i] = 0; // Silencio si la operación no es válida
                }
            }
        }

        // Devolver true para mantener vivo el procesador
        return true;
    }
}

registerProcessor('math-processor', MathProcessor);
