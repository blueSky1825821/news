import { jest } from '@jest/globals';
import { appendFile, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createWavHeader, finalizedAudioSeconds, readWavHeader } from '../src/services/xinwenlianbo/wav.js';

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

test('counts only finalized PCM data when a WAV contains metadata before and after it', () => {
  const dataBytes = 32_000 - 2;
  const base = createWavHeader(dataBytes);
  const metadata = Buffer.alloc(14);
  metadata.write('LIST');
  metadata.writeUInt32LE(5, 4);
  const header = Buffer.concat([base.subarray(0, 36), metadata, base.subarray(36)]);
  const fileBytes = header.length + dataBytes + metadata.length;
  header.writeUInt32LE(fileBytes - 8, 4);
  const wav = readWavHeader(header);
  expect(wav.dataOffset).toBe(58);
  expect(finalizedAudioSeconds(wav, fileBytes)).toBeLessThan(1);
  expect(() => finalizedAudioSeconds(wav, fileBytes - 2)).toThrow('音频数据不完整');
});

test('transcribes a full window before recording ends and includes overlapping audio in the next window', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'xwlb-live-test-'));
  const audioPath = path.join(directory, 'recording.wav');
  const header = Buffer.alloc(58);
  createWavHeader(0).copy(header, 0, 0, 36);
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
    expect(wav.readUInt32LE(40)).toBe(60 * 32_000);
    expect(wav[44]).toBe(17);
    expect(wav[44 + 6 * 32_000]).toBe(34);
    return '今天上午代表团抵达北京。';
  });

  let secondWindowPublished;
  const published = new Promise(resolve => { secondWindowPublished = resolve; });
  const progress = jest.fn(seconds => {
    if (seconds === 114) secondWindowPublished();
  });
  const worker = startLiveTranscription(audioPath, {}, progress);
  try {
    const wav = await started;
    expect(wav.readUInt32LE(40)).toBe(60 * 32_000);
    await appendFile(audioPath, Buffer.alloc(54 * 32_000, 34));
    await published;
    await worker.cancel();
    expect(progress.mock.calls).toEqual([
      [60, '接下来报道，今天上午，代表团'],
      [114, '接下来报道，今天上午代表团抵达北京。']
    ]);
    expect(await readdir(directory)).toEqual(['recording.wav']);
  } finally {
    await worker.cancel();
    await rm(directory, { recursive: true, force: true });
  }
});
