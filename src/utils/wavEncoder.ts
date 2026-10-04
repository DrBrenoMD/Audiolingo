// Ultra-fast In-Browser Audio Slicer & 16kHz Mono WAV Encoder
// Zero external dependencies. Converts any decoded audio segment into a compact WAV blob for speech transcription.

export function sliceAudioBufferToWavBlob(
  audioBuffer: AudioBuffer,
  startSec: number,
  endSec: number,
  targetSampleRate: number = 16000
): Blob {
  const actualStart = Math.max(0, startSec);
  const actualEnd = Math.min(audioBuffer.duration, endSec);
  const duration = actualEnd - actualStart;

  if (duration <= 0) {
    throw new Error('Invalid duration for audio slice');
  }

  const srcSampleRate = audioBuffer.sampleRate;
  const startSample = Math.floor(actualStart * srcSampleRate);
  const endSample = Math.floor(actualEnd * srcSampleRate);
  const numSrcSamples = endSample - startSample;

  // Mix all channels down to mono float32
  const monoData = new Float32Array(numSrcSamples);
  const numChannels = audioBuffer.numberOfChannels;

  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = audioBuffer.getChannelData(ch);
    for (let i = 0; i < numSrcSamples; i++) {
      monoData[i] += channelData[startSample + i] / numChannels;
    }
  }

  // Downsample to 16kHz (optimal for speech recognition and tiny payload size)
  const ratio = srcSampleRate / targetSampleRate;
  const numTargetSamples = Math.floor(numSrcSamples / ratio);
  const downsampled = new Int16Array(numTargetSamples);

  for (let i = 0; i < numTargetSamples; i++) {
    const srcIndex = Math.floor(i * ratio);
    const sample = Math.max(-1, Math.min(1, monoData[srcIndex]));
    // Convert float [-1, 1] to 16-bit PCM integer [-32768, 32767]
    downsampled[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  // Build standard 44-byte RIFF/WAV header
  const dataByteLength = downsampled.length * 2;
  const buffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(buffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataByteLength, true); // ChunkSize
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, 1, true); // NumChannels (1 = Mono)
  view.setUint32(24, targetSampleRate, true); // SampleRate (16000)
  view.setUint32(28, targetSampleRate * 2, true); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
  view.setUint16(32, 2, true); // BlockAlign (NumChannels * BitsPerSample/8)
  view.setUint16(34, 16, true); // BitsPerSample (16 bits)
  writeString(36, 'data');
  view.setUint32(40, dataByteLength, true); // Subchunk2Size

  // Write PCM data
  const pcmBytes = new Uint8Array(buffer, 44);
  pcmBytes.set(new Uint8Array(downsampled.buffer));

  return new Blob([buffer], { type: 'audio/wav' });
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
