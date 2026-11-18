import { spawn } from 'child_process';
import fs from 'fs';

export async function transcribe(audioPath, whisperExecutable, modelPath) {
  const outputPrefix = audioPath.replace(/\.wav$/, '');
  const outputTxt = `${outputPrefix}.txt`;

  await new Promise((resolve, reject) => {
    const whisper = spawn(whisperExecutable, [
      '-m', modelPath,
      '-f', audioPath,
      '-l', 'zh',
      '-otxt',
      '-of', outputPrefix,
      '-np'
    ]);

    whisper.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`whisper.cpp exited with code ${code}`));
    });

    whisper.on('error', reject);
  });

  const transcript = fs.readFileSync(outputTxt, 'utf-8');
  fs.unlinkSync(outputTxt);
  return transcript;
}
