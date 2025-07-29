// modules/AudioContext.js
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

let isAudioContextResumed = false;

function resumeAudioContext() {
    if (!isAudioContextResumed && audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            isAudioContextResumed = true;
            console.log("AudioContext resumed successfully.");
        }).catch(e => console.error("Error resuming AudioContext:", e));
    }
}

document.addEventListener('click', resumeAudioContext, { once: true });
document.addEventListener('keydown', resumeAudioContext, { once: true });

export { audioContext };