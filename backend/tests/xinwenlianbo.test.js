import { jest } from '@jest/globals';

describe('Xinwenlianbo Recorder', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('should spawn ffmpeg with correct args', async () => {
    const mockSpawn = jest.fn(() => ({
      on: jest.fn((event, cb) => {
        if (event === 'close') setTimeout(() => cb(0), 10);
      })
    }));
    jest.unstable_mockModule('child_process', () => ({ spawn: mockSpawn }));

    const { startRecording } = await import('../src/services/xinwenlianbo/recorder.js');
    await startRecording('http://test.m3u8', 60, '/tmp/test.wav');

    expect(mockSpawn).toHaveBeenCalledWith('ffmpeg', [
      '-i', 'http://test.m3u8',
      '-t', '60',
      '-ar', '16000',
      '-ac', '1',
      '-acodec', 'pcm_s16le',
      '-y',
      '/tmp/test.wav'
    ]);
  });
});
