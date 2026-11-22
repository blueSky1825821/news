import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { transcribe } from './transcriber.js';

import { BYTES_PER_SECOND, WAV_HEADER_READ_BYTES, createWavHeader, readWavHeader } from './wav.js';
const WINDOW_SECONDS = 60;
const OVERLAP_SECONDS = 6;

async function audioDataOffset(file) {
  const header = Buffer.alloc(WAV_HEADER_READ_BYTES);
  const { bytesRead } = await file.read(header, 0, header.length, 0);
  return readWavHeader(header.subarray(0, bytesRead))?.dataOffset;
}

async function writeWindow(file, offset, length, outputPath) {
  const header = createWavHeader(length);
  const wav = Buffer.allocUnsafe(header.length + length);
  header.copy(wav);
  const { bytesRead } = await file.read(wav, header.length, length, offset);
  if (bytesRead !== length) throw new Error('转录分段音频读取不完整');
  await fs.writeFile(outputPath, wav);
}

export function mergeTranscript(previous, next) {
  // Match spoken text without relying on Whisper's punctuation at a cut.
  const letters = /[\p{L}\p{N}]/gu;
  const left = [...previous.slice(-480).matchAll(letters)];
  const right = [...next.slice(0, 480).matchAll(letters)];
  const leftChars = left.map(match => match[0]);
  const rightChars = right.map(match => match[0]);
  // A window can start or end mid-word. Require a longer match when
  // discarding a few boundary characters to align the two readings.
  for (let size = Math.min(left.length, right.length, 120); size >= 4; size--) {
    const maxTrim = size >= 8 ? 4 : 0;
    for (let trimLeft = 0; trimLeft <= maxTrim && size + trimLeft <= left.length; trimLeft++) {
      const start = left.length - size - trimLeft;
      const match = leftChars.slice(start, start + size).join('');
      for (let trimRight = 0; trimRight <= maxTrim && size + trimRight <= right.length; trimRight++) {
        if (match !== rightChars.slice(trimRight, trimRight + size).join('')) continue;
        if (trimLeft === 0 && size + trimRight === right.length && next.length <= 480) return previous;
        const cut = Math.max(0, previous.length - 480) + left[start].index;
        return previous.slice(0, cut) + next.slice(trimRight ? right[trimRight].index : 0);
      }
    }
  }
  throw new Error('相邻转录分段无法可靠衔接');
}

export function startLiveTranscription(audioPath, config, onProgress) {
  const controller = new AbortController();
  const windowPath = path.join(path.dirname(audioPath), 'transcription-window.wav');
  const result = processAudio().catch(error => ({ error }));

  async function processAudio() {
    let start = 0;
    let transcript;
    let dataOffset;
    let file;
    try {
      while (!controller.signal.aborted) {
        if (!file) {
          file = await fs.open(audioPath, 'r').catch(error => {
            if (error.code !== 'ENOENT') throw error;
          });
        }
        dataOffset ??= file && await audioDataOffset(file);
        if (dataOffset) {
          const end = start + WINDOW_SECONDS * BYTES_PER_SECOND;
          if ((await file.stat()).size >= dataOffset + end) {
            await writeWindow(file, dataOffset + start, end - start, windowPath);
            const segment = (await transcribe(windowPath, config.whisperExecutable, config.whisperModelPath,
              undefined, controller.signal)).trim();
            if (!segment) throw new Error('录音分段未识别到文字');
            transcript = transcript === undefined ? segment : mergeTranscript(transcript, segment);
            onProgress(end / BYTES_PER_SECOND, transcript);
            start = end - OVERLAP_SECONDS * BYTES_PER_SECOND;
            continue;
          }
        }
        await delay(1000, undefined, { signal: controller.signal });
      }
      return {};
    } finally {
      await file?.close();
      await fs.rm(windowPath, { force: true });
      await fs.rm(windowPath.replace(/\.wav$/, '.txt'), { force: true });
    }
  }

  return {
    async cancel() {
      controller.abort();
      return result;
    }
  };
}
