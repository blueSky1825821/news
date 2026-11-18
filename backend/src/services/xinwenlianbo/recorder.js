import { spawn } from 'child_process';

let currentProcess = null;

export function startRecording(audioUrl, durationSeconds, outputPath) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', audioUrl,
      '-t', String(durationSeconds),
      '-ar', '16000',
      '-ac', '1',
      '-acodec', 'pcm_s16le',
      '-y',
      outputPath
    ]);

    currentProcess = ffmpeg;

    ffmpeg.on('close', (code) => {
      currentProcess = null;
      if (code === 0) resolve(outputPath);
      else if (code === null || code === 255) reject(new Error('Recording was stopped'));
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });

    ffmpeg.on('error', (err) => {
      currentProcess = null;
      reject(err);
    });
  });
}

export function stopRecording() {
  if (currentProcess) {
    currentProcess.kill('SIGTERM');
    currentProcess = null;
    return true;
  }
  return false;
}

export function isRecording() {
  return currentProcess !== null;
}
