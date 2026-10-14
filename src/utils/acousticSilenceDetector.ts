/**
 * Detector Acústico de Pausas e Silêncios no Navegador via Web Audio API.
 * 100% autônomo, determinístico, sem uso de IA ou chamadas a servidores.
 * 
 * Analisa a energia RMS (Root Mean Square) do sinal de áudio decodificado
 * e encontra os limites exatos de silêncio e pausas respiratórias da fala humana,
 * gerando fatias temporais precisas [start, end] para cada frase.
 */

export interface AcousticSegment {
  id: string;
  index: number;
  start: number; // segundos
  end: number;   // segundos
  duration: number; // segundos
}

export interface SilenceDetectionOptions {
  /** Duração mínima de silêncio contínuo para considerar quebra de frase (segundos). Padrão: 0.32s */
  minSilenceDuration?: number;
  /** Limiar de sensibilidade RMS em dB para detecção de silêncio. Padrão: -42 dB */
  silenceThresholdDb?: number;
  /** Duração mínima de uma frase falada (segundos). Padrão: 0.8s */
  minSpeechDuration?: number;
  /** Duração máxima permitida para uma frase antes de forçar corte no menor vale acústico (segundos). Padrão: 10.0s */
  maxSpeechDuration?: number;
  /** Margem de amortecimento nas bordas da fala (segundos). Padrão: 0.08s */
  paddingSeconds?: number;
}

/**
 * Obtém ou decodifica o AudioBuffer a partir de uma URL ou Blob.
 */
export async function getAudioBufferFromSource(
  source: string | Blob | ArrayBuffer,
  audioContext?: AudioContext | OfflineAudioContext
): Promise<AudioBuffer> {
  const ctx = audioContext || new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 22050 });
  let arrayBuffer: ArrayBuffer;

  if (source instanceof ArrayBuffer) {
    arrayBuffer = source;
  } else if (source instanceof Blob) {
    arrayBuffer = await source.arrayBuffer();
  } else if (typeof source === 'string') {
    const res = await fetch(source);
    arrayBuffer = await res.arrayBuffer();
  } else {
    throw new Error('Fonte de áudio inválida para decodificação acústica');
  }

  // Clona o buffer para evitar neutered arrayBuffer no webkit
  const bufferCopy = arrayBuffer.slice(0);
  return await ctx.decodeAudioData(bufferCopy);
}

/**
 * Executa a análise acústica de pausas e silêncios no áudio e retorna os segmentos de frase.
 */
export async function detectAcousticSentences(
  source: string | Blob | ArrayBuffer | AudioBuffer,
  options: SilenceDetectionOptions = {}
): Promise<AcousticSegment[]> {
  const {
    minSilenceDuration = 0.28,
    silenceThresholdDb = -42,
    minSpeechDuration = 0.6,
    maxSpeechDuration = 12.0,
    paddingSeconds = 0.22,
  } = options;

  let buffer: AudioBuffer;
  if (source instanceof AudioBuffer) {
    buffer = source;
  } else {
    buffer = await getAudioBufferFromSource(source);
  }

  const sampleRate = buffer.sampleRate;
  const channelData = buffer.getChannelData(0); // usa canal mono ou canal 0
  const totalSamples = channelData.length;
  const totalDuration = buffer.duration;

  if (totalDuration <= 0.2) {
    return [];
  }

  // Análise de energia em blocos (frames) de ~25ms para máxima precisão e velocidade
  const frameSize = Math.max(256, Math.floor(sampleRate * 0.025)); // ~25ms
  const numFrames = Math.floor(totalSamples / frameSize);
  const frameDuration = frameSize / sampleRate;

  const frameEnergiesDb = new Float32Array(numFrames);
  const minLinearRms = 1e-5;

  let minEnergy = 0;
  let maxEnergy = -100;
  let sumEnergy = 0;

  for (let f = 0; f < numFrames; f++) {
    const startIdx = f * frameSize;
    let sumSq = 0;
    for (let i = 0; i < frameSize; i++) {
      const sample = channelData[startIdx + i];
      sumSq += sample * sample;
    }
    const rms = Math.sqrt(sumSq / frameSize);
    const db = 20 * Math.log10(Math.max(rms, minLinearRms));
    frameEnergiesDb[f] = db;
    if (db > maxEnergy) maxEnergy = db;
    if (db < minEnergy) minEnergy = db;
    sumEnergy += db;
  }

  // Limiar adaptativo: se o áudio estiver muito baixo ou com ruído contínuo
  const avgEnergy = sumEnergy / numFrames;
  const dynamicThreshold = Math.min(silenceThresholdDb, avgEnergy - 8);

  const minSilenceFrames = Math.max(2, Math.floor(minSilenceDuration / frameDuration));
  const minSpeechFrames = Math.max(2, Math.floor(minSpeechDuration / frameDuration));
  const maxSpeechFrames = Math.floor(maxSpeechDuration / frameDuration);

  const segments: AcousticSegment[] = [];

  let inSpeech = false;
  let speechStartFrame = 0;
  let silenceCounter = 0;

  for (let f = 0; f < numFrames; f++) {
    const isSilent = frameEnergiesDb[f] < dynamicThreshold;

    if (!inSpeech) {
      if (!isSilent) {
        inSpeech = true;
        speechStartFrame = f;
        silenceCounter = 0;
      }
    } else {
      if (isSilent) {
        silenceCounter++;
      } else {
        silenceCounter = 0;
      }

      const currentSpeechDurationFrames = f - speechStartFrame;
      const reachedSilenceThreshold = silenceCounter >= minSilenceFrames;
      const reachedMaxDuration = currentSpeechDurationFrames >= maxSpeechFrames;

      if (reachedSilenceThreshold || reachedMaxDuration) {
        let speechEndFrame = f - (reachedSilenceThreshold ? silenceCounter : 0);

        if (reachedMaxDuration && !reachedSilenceThreshold) {
          const searchRangeStart = Math.floor(speechStartFrame + maxSpeechFrames * 0.7);
          let valleyFrame = searchRangeStart;
          let lowestDb = 0;
          for (let vf = searchRangeStart; vf <= f; vf++) {
            if (vf === searchRangeStart || frameEnergiesDb[vf] < lowestDb) {
              lowestDb = frameEnergiesDb[vf];
              valleyFrame = vf;
            }
          }
          speechEndFrame = valleyFrame;
        }

        const durationFrames = speechEndFrame - speechStartFrame;
        if (durationFrames >= minSpeechFrames) {
          const rawStart = speechStartFrame * frameDuration;
          const rawEnd = speechEndFrame * frameDuration;

          const start = Math.max(0, Number((rawStart - paddingSeconds).toFixed(2)));
          const end = Math.min(totalDuration, Number((rawEnd + paddingSeconds).toFixed(2)));

          segments.push({
            id: `acoustic-seg-${segments.length + 1}-${Math.round(start * 10)}`,
            index: segments.length,
            start,
            end,
            duration: Number((end - start).toFixed(2)),
          });
        }

        inSpeech = false;
        silenceCounter = 0;
      }
    }
  }

  if (inSpeech) {
    const speechEndFrame = numFrames;
    const durationFrames = speechEndFrame - speechStartFrame;
    if (durationFrames >= minSpeechFrames) {
      const rawStart = speechStartFrame * frameDuration;
      const rawEnd = speechEndFrame * frameDuration;
      const start = Math.max(0, Number((rawStart - paddingSeconds).toFixed(2)));
      const end = Math.min(totalDuration, Number(rawEnd.toFixed(2)));
      segments.push({
        id: `acoustic-seg-${segments.length + 1}-${Math.round(start * 10)}`,
        index: segments.length,
        start,
        end,
        duration: Number((end - start).toFixed(2)),
      });
    }
  }

  if (segments.length === 0 && totalDuration > 0) {
    const chunkDur = 6.0;
    const count = Math.ceil(totalDuration / chunkDur);
    for (let i = 0; i < count; i++) {
      const start = Number((i * chunkDur).toFixed(2));
      const end = Number((Math.min(totalDuration, (i + 1) * chunkDur)).toFixed(2));
      segments.push({
        id: `acoustic-seg-${i + 1}`,
        index: i,
        start,
        end,
        duration: Number((end - start).toFixed(2)),
      });
    }
  }

  // Passagem de Alinhamento e Costura Contínua sem zonas mortas entre frases
  if (segments.length > 0) {
    segments[0].start = 0;
    for (let i = 0; i < segments.length - 1; i++) {
      const current = segments[i];
      const next = segments[i + 1];
      if (next.start > current.end) {
        const gap = next.start - current.end;
        if (gap < 0.8) {
          const mid = Number(((current.end + next.start) / 2).toFixed(2));
          current.end = mid;
          next.start = mid;
        }
      } else if (next.start < current.end) {
        const mid = Number(((current.end + next.start) / 2).toFixed(2));
        current.end = mid;
        next.start = mid;
      }
      current.duration = Number((current.end - current.start).toFixed(2));
      current.index = i;
    }
    segments[segments.length - 1].end = Number(totalDuration.toFixed(2));
    segments[segments.length - 1].duration = Number(
      (segments[segments.length - 1].end - segments[segments.length - 1].start).toFixed(2)
    );
    segments[segments.length - 1].index = segments.length - 1;
  }

  return segments;
}
