import { EventEmitter } from 'node:events';
import { jest } from '@jest/globals';

function fakeProcess() {
  return Object.assign(new EventEmitter(), {
    exitCode: null,
    signalCode: null,
    stdin: Object.assign(new EventEmitter(), { writable: true, write: jest.fn() }),
    stderr: new EventEmitter(),
    kill: jest.fn(() => true)
  });
}

describe('Xinwenlianbo Recorder', () => {
  beforeEach(() => { jest.resetModules(); });

  it('records audio with bounded FFmpeg input and can finish early', async () => {
    const child = fakeProcess();
    const spawn = jest.fn(() => child);
    jest.unstable_mockModule('child_process', () => ({ spawn }));
    const { isRecording, startRecording, stopRecording } = await import('../src/services/xinwenlianbo/recorder.js');

    const recording = startRecording('http://test.m3u8', 60, '/tmp/test.wav');
    expect(spawn).toHaveBeenCalledWith('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-rw_timeout', '15000000',
      '-reconnect', '1', '-reconnect_streamed', '1',
      '-reconnect_on_network_error', '1', '-reconnect_on_http_error', '429,5xx',
      '-reconnect_delay_max', '5',
      '-i', 'http://test.m3u8', '-map', '0:a:0', '-t', '60',
      '-ar', '16000', '-ac', '1', '-acodec', 'pcm_s16le', '-flush_packets', '1', '-y', '/tmp/test.wav'
    ], { stdio: ['pipe', 'ignore', 'pipe'], timeout: 150000, killSignal: 'SIGKILL' });
    expect(stopRecording({ finish: true })).toBe(true);
    expect(child.stdin.write).toHaveBeenCalledWith('q\n');
    expect(isRecording()).toBe(true);
    child.emit('close', 0, null);
    await expect(recording).resolves.toBe('/tmp/test.wav');
    expect(isRecording()).toBe(false);
  });

  it('retains the process lock until a cancelled recording has exited', async () => {
    const child = fakeProcess();
    jest.unstable_mockModule('child_process', () => ({ spawn: () => child }));
    const { startRecording, stopRecording } = await import('../src/services/xinwenlianbo/recorder.js');

    const recording = startRecording('http://test.m3u8', 60, '/tmp/test.wav');
    expect(stopRecording()).toBe(true);
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(() => startRecording('http://test.m3u8', 60, '/tmp/other.wav')).toThrow('已有录制进程');
    child.emit('close', null, 'SIGTERM');
    await expect(recording).rejects.toMatchObject({ code: 'RECORDING_CANCELLED' });
  });

  it('kills an unresponsive recording after cancellation', async () => {
    const child = fakeProcess();
    jest.unstable_mockModule('child_process', () => ({ spawn: () => child }));
    const { startRecording, stopRecording } = await import('../src/services/xinwenlianbo/recorder.js');

    jest.useFakeTimers();
    try {
      const recording = startRecording('http://test.m3u8', 60, '/tmp/test.wav');
      expect(stopRecording()).toBe(true);
      jest.advanceTimersByTime(10_000);
      expect(child.kill).toHaveBeenLastCalledWith('SIGKILL');
      child.emit('close', null, 'SIGKILL');
      await expect(recording).rejects.toMatchObject({ code: 'RECORDING_CANCELLED' });
    } finally {
      jest.useRealTimers();
    }
  });
});
