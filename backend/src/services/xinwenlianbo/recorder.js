import { spawn } from 'child_process';

let currentRecording = null;

export function startRecording(audioUrl, durationSeconds, outputPath) {
  if (currentRecording) throw new Error('已有录制进程运行中');

  return new Promise((resolve, reject) => {
    const process = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-rw_timeout', '15000000',
      '-i', audioUrl, '-map', '0:a:0', '-t', String(durationSeconds),
      '-ar', '16000', '-ac', '1', '-acodec', 'pcm_s16le', '-flush_packets', '1', '-y', outputPath
    ], { stdio: ['pipe', 'ignore', 'pipe'], timeout: (durationSeconds + 90) * 1000 });

    const recording = { process, cancelled: false };
    currentRecording = recording;
    let stderr = '';
    process.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-1500); });
    process.stdin.on('error', () => { /* The process may exit before a stop command arrives. */ });

    const clear = () => {
      if (currentRecording === recording) currentRecording = null;
    };

    process.once('close', (code, signal) => {
      clear();
      if (recording.cancelled) {
        reject(Object.assign(new Error('录制已由管理员取消'), { code: 'RECORDING_CANCELLED' }));
      } else if (code === 0) {
        resolve(outputPath);
      } else {
        const reason = stderr.trim().split('\n').at(-1);
        console.error('[Xinwenlianbo] ffmpeg recording exited:', code ?? signal, reason);
        reject(new Error(signal ? '录制进程已退出或超时' : '录制失败，请检查直播流和服务器日志'));
      }
    });

    process.once('error', err => {
      clear();
      reject(new Error(err.code === 'ENOENT' ? '服务器未安装 FFmpeg，无法录制' : '无法启动 FFmpeg', { cause: err }));
    });
  });
}

export function stopRecording({ finish = false } = {}) {
  if (!currentRecording) return false;
  const { process } = currentRecording;
  if (process.exitCode !== null || process.signalCode !== null) return false;
  if (finish) {
    if (!process.stdin.writable) return false;
    process.stdin.write('q\n');
    return true;
  }
  if (!process.kill('SIGTERM')) return false;
  currentRecording.cancelled = true;
  return true;
}

export function isRecording() {
  return currentRecording !== null;
}
