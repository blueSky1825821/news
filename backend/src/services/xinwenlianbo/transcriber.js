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
      '--prompt', '这是一段普通话电视节目，使用简体中文和标点符号。',
      '-otxt',
      '-of', outputPrefix,
      '-np'
    ], { stdio: ['ignore', 'ignore', 'pipe'] });

    let stderr = '';
    whisper.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-1500); });
    whisper.on('close', (code) => {
      if (code === 0) resolve();
      else {
        console.error('[Xinwenlianbo] Whisper exited:', code, stderr.trim());
        reject(new Error('转录失败，请检查 Whisper 配置和服务器日志'));
      }
    });

    whisper.on('error', reject);
  });

  const transcript = fs.readFileSync(outputTxt, 'utf-8');
  fs.unlinkSync(outputTxt);
  return transcript;
}
