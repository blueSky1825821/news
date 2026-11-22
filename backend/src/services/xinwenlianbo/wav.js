export const SAMPLE_RATE = 16_000;
const FRAME_BYTES = 2;
export const BYTES_PER_SECOND = SAMPLE_RATE * FRAME_BYTES;
export const WAV_HEADER_READ_BYTES = 4096;

export function readWavHeader(header) {
  if (header.length < 12) return null;
  if (header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('录音 WAV 文件头无效');
  }

  let hasFormat = false;
  for (let offset = 12; offset + 8 <= header.length;) {
    const chunk = header.toString('ascii', offset, offset + 4);
    const size = header.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (chunk === 'fmt ') {
      if (size < 16) throw new Error('录音 WAV 格式无效');
      if (start + 16 > header.length) return null;
      hasFormat = header.readUInt16LE(start) === 1 &&
        header.readUInt16LE(start + 2) === 1 &&
        header.readUInt32LE(start + 4) === SAMPLE_RATE &&
        header.readUInt32LE(start + 8) === BYTES_PER_SECOND &&
        header.readUInt16LE(start + 12) === FRAME_BYTES &&
        header.readUInt16LE(start + 14) === 16;
      if (!hasFormat) throw new Error('录音 WAV 格式不是 16 kHz 单声道 PCM');
    }
    if (chunk === 'data') {
      if (!hasFormat) throw new Error('录音 WAV 缺少格式信息');
      return { dataOffset: start, dataBytes: size, riffBytes: header.readUInt32LE(4) + 8 };
    }
    offset = start + size + (size % 2);
  }
  return null;
}

export function finalizedAudioSeconds(wav, fileBytes) {
  if (!wav || wav.riffBytes !== fileBytes ||
      wav.dataOffset + wav.dataBytes > wav.riffBytes || wav.dataBytes % FRAME_BYTES !== 0) {
    throw new Error('录音 WAV 音频数据不完整');
  }
  return wav.dataBytes / BYTES_PER_SECOND;
}

export function createWavHeader(dataBytes) {
  const header = Buffer.alloc(44);
  header.write('RIFF');
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(BYTES_PER_SECOND, 28);
  header.writeUInt16LE(FRAME_BYTES, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataBytes, 40);
  return header;
}
