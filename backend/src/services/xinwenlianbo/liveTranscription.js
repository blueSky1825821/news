import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { transcribe } from './transcriber.js';

const BYTES_PER_SECOND = 32_000;
const WINDOW_SECONDS = 60;
const OVERLAP_SECONDS = 6;

async function audioDataOffset(file) {
  const header = Buffer.alloc(4096);
  const { bytesRead } = await file.read(header, 0, header.length, 0);
  if (bytesRead < 12) return null;
  if (header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('无法读取录音 WAV 文件头');
  }
  for (let offset = 12; offset + 8 <= bytesRead;) {
    if (header.toString('ascii', offset, offset + 4) === 'data') return offset + 8;
    const size = header.readUInt32LE(offset + 4);
    offset += 8 + size + (size % 2);
  }
  return null;
}

async function writeWindow(file, offset, length, outputPath) {
  const wav = Buffer.alloc(44 + length);
  wav.write('RIFF');
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16_000, 24);
  wav.writeUInt32LE(BYTES_PER_SECOND, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(length, 40);
  const { bytesRead } = await file.read(wav, 44, length, offset);
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
  let finished = false;
  const result = processAudio().catch(error => ({ error }));

  async function processAudio() {
    let start = 0;
    let covered = 0;
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
          const bytes = (await file.stat()).size - dataOffset;
          const available = Math.floor(bytes / 2) * 2;
          const end = Math.min(start + WINDOW_SECONDS * BYTES_PER_SECOND, available);
          if (end > covered && (finished || end - start === WINDOW_SECONDS * BYTES_PER_SECOND)) {
            // For a short recording, the finalized WAV is already a complete window.
            if (finished && start === 0 && end === available) return {};
            await writeWindow(file, dataOffset + start, end - start, windowPath);
            const segment = (await transcribe(windowPath, config.whisperExecutable, config.whisperModelPath, percent => {
              onProgress((covered + (end - covered) * percent / 100) / BYTES_PER_SECOND, false);
            }, controller.signal)).trim();
            if (!segment) throw new Error('录音分段未识别到文字');
            transcript = transcript === undefined ? segment : mergeTranscript(transcript, segment);
            covered = end;
            onProgress(covered / BYTES_PER_SECOND, true, transcript);
            start = end - OVERLAP_SECONDS * BYTES_PER_SECOND;
            continue;
          }
          if (finished && covered > 0) return { transcript };
        }
        if (finished) return {};
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
    finish() {
      finished = true;
      return result;
    },
    async cancel() {
      controller.abort();
      await result;
    }
  };
}
