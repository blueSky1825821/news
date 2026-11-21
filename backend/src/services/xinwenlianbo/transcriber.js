import { spawn } from 'child_process';
import fs from 'fs';

export async function transcribe(audioPath, whisperExecutable, modelPath, onProgress = () => {}, signal) {
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
      '-pp'
    ], { stdio: ['ignore', 'ignore', 'pipe'], signal, killSignal: 'SIGKILL' });

    let stderr = '';
    let pending = '';
    let percent = -1;
    function report(line) {
      const match = /progress\s*=\s*(\d{1,3})\s*%/i.exec(line);
      const next = Number(match?.[1]);
      if (next > percent && next <= 100) {
        percent = next;
        onProgress(percent);
      }
    }
    whisper.stderr.setEncoding('utf8');
    whisper.stderr.on('data', chunk => {
      stderr = (stderr + chunk).slice(-1500);
      const lines = (pending + chunk).split(/[\r\n]+/);
      pending = lines.pop().slice(-1500);
      lines.forEach(report);
      report(pending);
    });
    let processError;
    whisper.on('error', err => { processError = err; });
    whisper.on('close', (code, signal) => {
      if (processError) return reject(processError);
      if (code === 0) resolve();
      else {
        const cause = new Error(`Whisper exited (${code ?? signal}): ${stderr.trim()}`);
        reject(new Error('转录失败，请检查 Whisper 配置和服务器日志', { cause }));
      }
    });

  });

  const transcript = fs.readFileSync(outputTxt, 'utf-8');
  fs.unlinkSync(outputTxt);
  return transcript;
}
