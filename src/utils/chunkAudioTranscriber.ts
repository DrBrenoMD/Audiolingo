// Chunk Audio Transcriber: Slices audio into 20-second 16kHz WAV clips on-the-fly and transcribes progressively
import { sliceAudioBufferToWavBlob, blobToBase64 } from './wavEncoder';
import { Sentence } from '../types';

const audioBufferCache = new Map<string, AudioBuffer>();
const chunkResultsCache = new Map<string, Sentence[]>();

export class ChunkAudioTranscriber {
  private activeJobs = new Set<string>();
  public has404Error: boolean = false;
  private warned404: boolean = false;

  /**
   * Decodes an audio blob/file into memory. Cached for fast random slicing.
   */
  async getAudioBuffer(blobUrl: string): Promise<AudioBuffer> {
    if (audioBufferCache.has(blobUrl)) {
      return audioBufferCache.get(blobUrl)!;
    }

    const response = await fetch(blobUrl);
    const arrayBuffer = await response.arrayBuffer();

    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    try {
      const decoded = await audioCtx.decodeAudioData(arrayBuffer);
      audioBufferCache.set(blobUrl, decoded);
      return decoded;
    } finally {
      // Keep audioCtx active
    }
  }

  /**
   * Transcribe a specific time slice (e.g. 20 seconds) on-the-fly
   */
  async transcribeSlice(
    blobUrl: string,
    startSec: number,
    durationSec: number = 20
  ): Promise<Sentence[]> {
    // If the deployment returned 404 for the API, avoid spamming requests
    if (this.has404Error) {
      return [];
    }

    const chunkKey = `${blobUrl}_${Math.floor(startSec)}_${Math.floor(durationSec)}`;

    if (chunkResultsCache.has(chunkKey)) {
      return chunkResultsCache.get(chunkKey)!;
    }

    if (this.activeJobs.has(chunkKey)) {
      return [];
    }

    this.activeJobs.add(chunkKey);

    try {
      const audioBuffer = await this.getAudioBuffer(blobUrl);
      const actualEnd = Math.min(audioBuffer.duration, startSec + durationSec);
      const actualDuration = actualEnd - startSec;

      if (actualDuration <= 0.5) {
        return [];
      }

      // 1. Slice audio in-browser down to a compact 16kHz WAV blob (~400KB - 800KB)
      const wavBlob = sliceAudioBufferToWavBlob(audioBuffer, startSec, actualEnd, 16000);

      // 2. Convert to base64
      const base64 = await blobToBase64(wavBlob);

      // 3. Send slice to backend for ultra-fast transcription
      const res = await fetch('/api/transcribe-chunk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioChunkBase64: base64,
          mimeType: 'audio/wav',
          startOffset: startSec,
          duration: actualDuration,
        }),
      });

      if (res.status === 404) {
        this.has404Error = true;
        if (!this.warned404) {
          console.warn(
            '[EchoLingo] A rota /api/transcribe-chunk retornou 404. Na Vercel, certifique-se de implantar com vercel.json e api/index.ts configurados.'
          );
          this.warned404 = true;
        }
        return [];
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      const sentences: Sentence[] = data.sentences || [];

      if (sentences.length > 0) {
        chunkResultsCache.set(chunkKey, sentences);
      }

      return sentences;
    } catch (err) {
      console.warn(`Chunk transcribe error for [${startSec}s - ${startSec + durationSec}s]:`, err);
      return [];
    } finally {
      this.activeJobs.delete(chunkKey);
    }
  }

  hasCachedChunk(blobUrl: string, startSec: number, durationSec: number = 20): boolean {
    const chunkKey = `${blobUrl}_${Math.floor(startSec)}_${Math.floor(durationSec)}`;
    return chunkResultsCache.has(chunkKey);
  }

  isJobActive(blobUrl: string, startSec: number, durationSec: number = 20): boolean {
    const chunkKey = `${blobUrl}_${Math.floor(startSec)}_${Math.floor(durationSec)}`;
    return this.activeJobs.has(chunkKey);
  }
}

export const chunkTranscriber = new ChunkAudioTranscriber();
