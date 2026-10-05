// Smart Elastic Audio-Text Aligner (Com Tolerância a Diferenças)
// Synchronizes uploaded book text (PDF, EPUB, TXT) with audio without heavy transcription delays
import { Sentence, WordCue } from '../types';

export interface AlignmentOptions {
  leadInSeconds?: number; // Delay before speech starts (e.g. intro music/chimes, default: 0)
  tailSilenceSeconds?: number; // Silence at end of audio (default: 1.0s)
  speedMultiplier?: number;
}

/**
 * Checks if a sentence is a placeholder waiting for transcription
 */
export function isPlaceholderSentence(sentence: { text?: string; id?: string } | null | undefined): boolean {
  if (!sentence || !sentence.text) return true;
  const t = sentence.text.trim();
  return (
    t.startsWith('Audiobook narration segment') ||
    t.startsWith('Audio playback segment') ||
    t.startsWith('Chapter audio:') ||
    t.startsWith('Trecho') ||
    t.includes('• [') ||
    t.includes('Aguardando transcrição') ||
    t.includes('Configure GROQ_API_KEY') ||
    sentence.id?.startsWith('placeholder-') === true
  );
}

/**
 * Estimates phonetic syllables in an English word for realistic acoustic duration weighting
 */
function estimateSyllables(word: string): number {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  if (clean.length <= 3) return 1;
  const replaced = clean.replace(/(?:[^laeiouy]|ed|es|e)$/, '')
    .replace(/^y/, '');
  const matches = replaced.match(/[aeiouy]{1,2}/g);
  return matches ? Math.max(1, matches.length) : 1;
}

/**
 * Computes acoustic reading weight of a sentence based on words, syllables, and punctuation pauses
 */
function computeSentenceWeight(sentenceText: string): { weight: number; words: string[] } {
  const rawWords = sentenceText.split(/\s+/).filter(Boolean);
  if (rawWords.length === 0) return { weight: 1, words: [] };

  let totalSyllables = 0;
  for (const w of rawWords) {
    totalSyllables += estimateSyllables(w);
  }

  // Count punctuation pauses (commas, semicolons, dashes)
  const commaCount = (sentenceText.match(/[,;—–]/g) || []).length;
  // Sentence ending pause weight
  const terminalPause = sentenceText.match(/[.!?]$/) ? 1.5 : 0.8;

  const weight = (rawWords.length * 0.8) + (totalSyllables * 0.25) + (commaCount * 0.3) + terminalPause;
  return { weight: Math.max(0.8, weight), words: rawWords };
}

/**
 * Elastically aligns text sentences to the audio file duration with tolerance for small differences
 */
export function alignTextToAudio(
  sentences: string[],
  audioDurationSeconds: number,
  options: AlignmentOptions = {}
): Sentence[] {
  const { leadInSeconds = 0.5, tailSilenceSeconds = 1.0 } = options;

  if (sentences.length === 0) return [];

  const availableAudioTime = Math.max(2, audioDurationSeconds - leadInSeconds - tailSilenceSeconds);

  // 1. Calculate acoustic weight for each sentence
  const weightedSentences = sentences.map((text, idx) => {
    const { weight, words } = computeSentenceWeight(text);
    return {
      index: idx,
      text: text.trim(),
      weight,
      words,
    };
  });

  const totalWeight = weightedSentences.reduce((acc, curr) => acc + curr.weight, 0);

  // 2. Allocate timeline dynamically
  let currentOffset = Math.max(0, leadInSeconds);

  const resultSentences: Sentence[] = weightedSentences.map((s, idx) => {
    const proportionalDuration = (s.weight / Math.max(1, totalWeight)) * availableAudioTime;
    const start = +currentOffset.toFixed(2);
    const end = +(currentOffset + proportionalDuration).toFixed(2);
    currentOffset += proportionalDuration;

    // Distribute word timestamps inside the sentence (only if not a placeholder)
    const isPlh = isPlaceholderSentence(s);
    const wordCount = Math.max(1, s.words.length);
    const wordDur = proportionalDuration / wordCount;

    const wordCues: WordCue[] = isPlh
      ? []
      : s.words.map((w, wIdx) => {
          const wStart = +(start + wIdx * wordDur).toFixed(2);
          const wEnd = +(start + (wIdx + 1) * wordDur).toFixed(2);
          const clean = w.replace(/[^a-zA-Z0-9']/g, '').toLowerCase();

          return {
            word: w,
            cleanWord: clean,
            start: wStart,
            end: wEnd,
            index: wIdx,
          };
        });

    return {
      id: isPlh ? `placeholder-s-${idx}` : `aligned-s-${idx}`,
      index: idx,
      start,
      end,
      text: s.text,
      translationPt: '', // Loaded on-demand or fast-translated
      words: wordCues,
    };
  });

  return resultSentences;
}

/**
 * Nudges a sentence's start and end times by a delta (e.g. +0.5s or -0.5s) to compensate for intro variations
 */
export function adjustSentenceSync(
  sentences: Sentence[],
  sentenceIndex: number,
  deltaSeconds: number
): Sentence[] {
  return sentences.map((s, idx) => {
    if (idx < sentenceIndex) {
      return s; // previous sentences unchanged
    }
    const newStart = Math.max(0, +(s.start + deltaSeconds).toFixed(2));
    const newEnd = Math.max(newStart + 0.5, +(s.end + deltaSeconds).toFixed(2));

    const wordDur = (newEnd - newStart) / Math.max(1, s.words.length);
    const shiftedWords: WordCue[] = s.words.map((w, wIdx) => ({
      ...w,
      start: +(newStart + wIdx * wordDur).toFixed(2),
      end: +(newStart + (wIdx + 1) * wordDur).toFixed(2),
    }));

    return {
      ...s,
      start: newStart,
      end: newEnd,
      words: shiftedWords,
    };
  });
}

/**
 * Snaps the selected sentence directly to the current audio time and shifts subsequent sentences
 */
export function snapSentenceToCurrentTime(
  sentences: Sentence[],
  sentenceIndex: number,
  targetAudioTime: number
): Sentence[] {
  const currentSentence = sentences[sentenceIndex];
  if (!currentSentence) return sentences;

  const delta = targetAudioTime - currentSentence.start;
  return adjustSentenceSync(sentences, sentenceIndex, delta);
}
