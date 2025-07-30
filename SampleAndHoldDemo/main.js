import { SampleAndHold } from './SampleAndHold.js';

document.getElementById('startBtn').addEventListener('click', async () => {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') await audioCtx.resume();

  const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;

  const lfo = audioCtx.createOscillator();
  lfo.frequency.value = 3;
  const waveShaper = audioCtx.createWaveShaper();
  waveShaper.curve = new Float32Array([ -1, 1 ]);
  lfo.connect(waveShaper);

  const sAndH = new SampleAndHold(noise, waveShaper, audioCtx);

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  gain.gain.value = 200;

  sAndH.output.connect(gain);
  gain.connect(osc.frequency);

  osc.type = 'sine';
  osc.frequency.value = 440;
  osc.connect(audioCtx.destination);

  noise.start();
  lfo.start();
  osc.start();

  function tick() {
    sAndH.update();
    requestAnimationFrame(tick);
  }
  tick();
});
