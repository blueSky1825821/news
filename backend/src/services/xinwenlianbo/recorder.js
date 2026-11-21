import { spawn } from 'child_process';

let currentRecording = null;

export function startRecording(audioUrl, durationSeconds, outputPath) {
  if (currentRecording) throw new Error('已有录制进程运行中');

  const reconnectOptions = /^https?:\/\//i.test(audioUrl) ? [
    '-reconnect', '1', '-reconnect_streamed', '1',
    '-reconnect_on_network_error', '1', '-reconnect_on_http_error', '429,5xx',
    '-reconnect_delay_max', '5'
  ] : [];
  return new Promise((resolve, reject) => {
    const process = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-rw_timeout', '15000000',
      ...reconnectOptions,
      '-i', audioUrl, '-map', '0:a:0', '-t', String(durationSeconds),
      '-ar', '16000', '-ac', '1', '-acodec', 'pcm_s16le', '-flush_packets', '1', '-y', outputPath
    ], { stdio: ['pipe', 'ignore', 'pipe'], timeout: (durationSeconds + 90) * 1000, killSignal: 'SIGKILL' });

    const recording = { process, cancelled: false };
    currentRecording = recording;
    let stderr = '';
    let processError;
    process.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-1500); });
    process.stdin.on('error', () => { /* The process may exit before a stop command arrives. */ });

    process.once('error', err => { processError = err; });

    process.once('close', (code, signal) => {
      clearTimeout(recording.stopTimeout);
      if (currentRecording === recording) currentRecording = null;
      if (recording.cancelled) {
        reject(Object.assign(new Error('录制已由管理员取消'), { code: 'RECORDING_CANCELLED' }));
      } else if (processError) {
        reject(new Error(processError.code === 'ENOENT' ? '服务器未安装 FFmpeg，无法录制' : 'FFmpeg 进程出错', { cause: processError }));
      } else if (code === 0) {
        resolve(outputPath);
      } else {
        const reason = stderr.trim().split('\n').at(-1);
        const cause = new Error(`FFmpeg exited (${code ?? signal}): ${reason || 'no stderr'}`);
        reject(new Error(signal ? '录制进程已退出或超时' : '录制失败，请检查直播流和服务器日志', { cause }));
      }
    });
  });
}

export function stopRecording({ finish = false } = {}) {
  if (!currentRecording) return false;
  const recording = currentRecording;
  const { process } = recording;
  if (recording.stopTimeout || process.exitCode !== null || process.signalCode !== null) return false;
  if (finish) {
    if (!process.stdin.writable) return false;
    process.stdin.write('q\n');
  } else {
    if (!process.kill('SIGTERM')) return false;
    recording.cancelled = true;
  }
  recording.stopTimeout = setTimeout(() => process.kill('SIGKILL'), 10_000);
  recording.stopTimeout.unref();
  return true;
}

export function isRecording() {
  return currentRecording !== null;
}
