import { jest } from '@jest/globals';
import { appendFile, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const transcribe = jest.fn();
jest.unstable_mockModule('../src/services/xinwenlianbo/transcriber.js', () => ({ transcribe }));
const { mergeTranscript, startLiveTranscription } = await import('../src/services/xinwenlianbo/liveTranscription.js');

test('merges matching speech with different punctuation and rejects uncertain joins', () => {
  expect(mergeTranscript('接下来报道，今天上午，代表团', '今天上午代表团抵达北京。'))
    .toBe('接下来报道，今天上午代表团抵达北京。');
  expect(mergeTranscript('接下来报道，今天上午代表团已经到', '在今天上午代表团已经抵达北京。'))
    .toBe('接下来报道，今天上午代表团已经抵达北京。');
  expect(() => mergeTranscript('接下来报道今天上午', '代表团抵达北京')).toThrow('无法可靠衔接');
});

test('transcribes a full window before recording ends and includes overlapping audio in the final window', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'xwlb-live-test-'));
  const audioPath = path.join(directory, 'recording.wav');
  const header = Buffer.alloc(58);
  header.write('RIFF');
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.write('LIST', 36);
  header.writeUInt32LE(5, 40);
  header.write('data', 50);
  const firstAudio = Buffer.alloc(60 * 32_000, 17);
  await writeFile(audioPath, Buffer.concat([header, firstAudio]));

  let firstWindowStarted;
  const started = new Promise(resolve => { firstWindowStarted = resolve; });
  transcribe.mockImplementationOnce(async windowPath => {
    firstWindowStarted(await readFile(windowPath));
    return '接下来报道，今天上午，代表团';
  }).mockImplementationOnce(async windowPath => {
    const wav = await readFile(windowPath);
    expect(wav.readUInt32LE(40)).toBe(8 * 32_000);
    expect(wav[44]).toBe(17);
    expect(wav[44 + 6 * 32_000]).toBe(34);
    return '今天上午代表团抵达北京。';
  });

  const progress = jest.fn();
  const worker = startLiveTranscription(audioPath, {}, progress);
  try {
    const wav = await started;
    expect(wav.readUInt32LE(40)).toBe(60 * 32_000);
    await appendFile(audioPath, Buffer.alloc(2 * 32_000, 34));
    await expect(worker.finish()).resolves.toEqual({ transcript: '接下来报道，今天上午代表团抵达北京。' });
    expect(progress.mock.calls).toEqual([[60, true], [62, true]]);
    expect(await readdir(directory)).toEqual(['recording.wav']);
  } finally {
    await worker.cancel();
    await rm(directory, { recursive: true, force: true });
  }
});
