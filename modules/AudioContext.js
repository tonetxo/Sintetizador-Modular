// modules/AudioContext.js
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

async function resumeAudioContext() {
    if (audioContext.state === 'suspended') {
        try {
            await audioContext.resume();
            console.log("AudioContext resumed successfully");
        } catch (e) {
            console.error("Error resuming AudioContext:", e);
        }
    }
}

function onAudioReady(callback) {
    resumeAudioContext().then(() => {
        callback();
    });
}

document.addEventListener('click', resumeAudioContext, { once: true });
document.addEventListener('keydown', resumeAudioContext, { once: true });
document.addEventListener('touchstart', resumeAudioContext, { once: true });

export { audioContext, onAudioReady };
