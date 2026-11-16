import { spawn } from 'child_process';

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

    ffmpeg.on('close', (code) => {
      if (code === 0) resolve(outputPath);
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });

    ffmpeg.on('error', reject);
  });
}
