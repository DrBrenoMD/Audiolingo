/**
 * Motor de Antecipação e Fila de Transcrição por Frase (Look-Ahead Engine).
 * 100% autônomo, determinístico, sem uso de IA ou servidores externos.
 * 
 * Funcionalidades:
 * 1. Monitora o cursor de reprodução (`currentTime`) e a frase ativa (índice i).
 * 2. Mantém uma janela deslizante antecipando a transcrição das 3 próximas frases (i+1, i+2, i+3).
 * 3. Processa cada frase individualmente.
 * 4. Controla a revelação progressiva palavra por palavra conforme o áudio toca.
 */

import { Sentence, WordCue } from '../types';
import { AcousticSegment } from './acousticSilenceDetector';
import { isPlaceholderSentence } from './fuzzyAligner';
import { chunkTranscriber } from './chunkAudioTranscriber';

export type PhraseStatus = 'pending' | 'processing' | 'buffered' | 'active' | 'completed';

export interface LookAheadPhrase {
  sentence: Sentence;
  status: PhraseStatus;
  progressPercent: number; // 0 a 100
  isAnticipated: boolean; // se está na janela de 3 frases à frente
}

export type PhraseUpdateCallback = (updatedSentence: Sentence) => void;
export type QueueStatusCallback = (activePhrases: LookAheadPhrase[], currentPhraseIndex: number) => void;

function estimateWordWeight(word: string): number {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!clean) return 1.0;

  const shortStops = new Set([
    'a', 'an', 'the', 'in', 'on', 'at', 'to', 'of', 'and', 'or', 'is', 'it', 'as', 'he', 'we', 'i', 'my', 'by', 'up', 'so', 'if', 'be', 'me', 'us'
  ]);
  if (shortStops.has(clean)) {
    return 0.65;
  }

  const replaced = clean.replace(/(?:[^laeiouy]|ed|es|e)$/, '').replace(/^y/, '');
  const matches = replaced.match(/[aeiouy]{1,2}/g);
  const syllables = matches ? Math.max(1, matches.length) : 1;

  let weight = syllables * 1.0;
  if (clean.length > 7) weight += 0.35;

  if (/[,;—–-]$/.test(word)) {
    weight += 0.55;
  } else if (/[.!?]$/.test(word)) {
    weight += 0.85;
  }

  return Math.max(0.5, weight);
}

export function distributeWordTimestamps(
  rawWords: string[],
  startOffset: number,
  duration: number
): WordCue[] {
  if (rawWords.length === 0) return [];
  if (rawWords.length === 1) {
    const w = rawWords[0];
    return [{
      word: w,
      cleanWord: w.replace(/[^a-zA-Z0-9']/g, '').toLowerCase(),
      start: +startOffset.toFixed(2),
      end: +(startOffset + duration).toFixed(2),
      index: 0,
    }];
  }

  const weights = rawWords.map(estimateWordWeight);
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  let currentStart = startOffset;
  const result: WordCue[] = [];

  for (let i = 0; i < rawWords.length; i++) {
    const w = rawWords[i];
    const isLast = i === rawWords.length - 1;
    const wordDur = (weights[i] / totalWeight) * duration;
    const wordEnd = isLast ? startOffset + duration : currentStart + wordDur;

    result.push({
      word: w,
      cleanWord: w.replace(/[^a-zA-Z0-9']/g, '').toLowerCase(),
      start: +currentStart.toFixed(2),
      end: +wordEnd.toFixed(2),
      index: i,
    });

    currentStart = wordEnd;
  }

  return result;
}

export class PhraseLookAheadEngine {
  private sentences: Sentence[] = [];
  private currentPhraseIndex: number = -1;
  private lookAheadWindowSize: number = 3;
  private audioUrl: string = '';
  private processingIndices: Set<number> = new Set();
  private completedIndices: Set<number> = new Set();
  private onPhraseUpdate: PhraseUpdateCallback | null = null;
  private onQueueStatus: QueueStatusCallback | null = null;
  private recognitionWorkerActive: boolean = false;
  private activeAudioElement: HTMLAudioElement | null = null;

  constructor(sentences: Sentence[] = [], lookAheadWindowSize: number = 3, audioUrl: string = '') {
    this.sentences = sentences;
    this.lookAheadWindowSize = lookAheadWindowSize;
    this.audioUrl = audioUrl;
  }

  public setAudioUrl(url: string) {
    this.audioUrl = url;
  }

  /**
   * Antecipa imediatamente a transcrição das primeiras N frases (por padrão 3 frases)
   * em segundo plano, para que já estejam prontas antes mesmo do usuário apertar Play.
   */
  public preloadLookAheadWindow(count: number = 3) {
    const limit = Math.min(count, this.sentences.length);
    for (let i = 0; i < limit; i++) {
      this.triggerAnticipatedProcessing(i);
    }
  }

  /**
   * Atualiza a lista de frases (por exemplo após segmentação acústica).
   */
  public setSentences(sentences: Sentence[]) {
    this.sentences = [...sentences];
    this.processingIndices.clear();
    this.completedIndices.clear();
    // Marca frases com texto real como já prontas
    this.sentences.forEach((s, idx) => {
      if (!isPlaceholderSentence(s) && s.words && s.words.length > 0 && !s.text.startsWith('Phrase ')) {
        this.completedIndices.add(idx);
      }
    });
    this.notifyQueueStatus();
  }

  public getSentences(): Sentence[] {
    return this.sentences;
  }

  public setOnPhraseUpdate(cb: PhraseUpdateCallback) {
    this.onPhraseUpdate = cb;
  }

  public setOnQueueStatus(cb: QueueStatusCallback) {
    this.onQueueStatus = cb;
  }

  public attachAudioElement(audio: HTMLAudioElement) {
    this.activeAudioElement = audio;
  }

  /**
   * Chamado a cada atualização do cursor de reprodução (ex: timeupdate ou requestAnimationFrame).
   * Localiza a frase atual e dispara antecipação das próximas 3 frases.
   */
  public updatePlaybackPosition(currentTime: number): {
    currentPhraseIndex: number;
    currentSentence: Sentence | null;
    anticipatedSentences: Sentence[];
  } {
    if (this.sentences.length === 0) {
      return { currentPhraseIndex: -1, currentSentence: null, anticipatedSentences: [] };
    }

    // 1. Identifica a frase ativa pelo tempo atual
    let activeIdx = this.sentences.findIndex((s) => currentTime >= s.start && currentTime <= s.end);

    // Se estiver entre frases (num intervalo de pausa acústica), aproxima para a próxima ou anterior
    if (activeIdx === -1) {
      activeIdx = this.sentences.findIndex((s) => currentTime < s.start);
      if (activeIdx === -1 && currentTime >= this.sentences[this.sentences.length - 1].end) {
        activeIdx = this.sentences.length - 1;
      }
    }

    if (activeIdx !== -1 && activeIdx !== this.currentPhraseIndex) {
      this.currentPhraseIndex = activeIdx;
    }

    // 2. Determina a frase ativa e as próximas frases para antecipação contínua
    const anticipated: Sentence[] = [];
    if (activeIdx !== -1) {
      // Prioridade 1: Garante que a frase ATUAL (onde o cursor está ou para onde o usuário avançou/retrocedeu) seja transcrita imediatamente
      this.triggerAnticipatedProcessing(activeIdx);

      // Prioridade 2: Dispara pré-processamento em segundo plano das frases à frente
      for (let offset = 1; offset <= this.lookAheadWindowSize; offset++) {
        const nextIdx = activeIdx + offset;
        if (nextIdx < this.sentences.length) {
          anticipated.push(this.sentences[nextIdx]);
          this.triggerAnticipatedProcessing(nextIdx);
        }
      }
    }

    this.notifyQueueStatus();

    return {
      currentPhraseIndex: activeIdx,
      currentSentence: activeIdx >= 0 ? this.sentences[activeIdx] : null,
      anticipatedSentences: anticipated,
    };
  }

  /**
   * Dispara o processamento individual em segundo plano de uma frase antecipada.
   * Envia a fatia de áudio para a API de reconhecimento no servidor sem IA.
   */
  public async triggerAnticipatedProcessing(phraseIndex: number) {
    if (
      phraseIndex < 0 ||
      phraseIndex >= this.sentences.length ||
      this.processingIndices.has(phraseIndex) ||
      this.completedIndices.has(phraseIndex)
    ) {
      return;
    }

    const sentence = this.sentences[phraseIndex];

    // Se a frase já possui texto real transcrito, marca como concluída e ignora
    if (!isPlaceholderSentence(sentence) && sentence.words && sentence.words.length > 0 && !sentence.text.startsWith('Phrase ')) {
      this.completedIndices.add(phraseIndex);
      return;
    }

    this.processingIndices.add(phraseIndex);
    this.notifyQueueStatus();

    try {
      const duration = Math.max(0.6, sentence.end - sentence.start);

      // 1. Se possuir audioUrl, fatia o áudio em memória e envia para reconhecimento de voz via API
      if (this.audioUrl) {
        const transcribedList = await chunkTranscriber.transcribeSlice(
          this.audioUrl,
          sentence.start,
          duration
        );

        if (transcribedList && transcribedList.length > 0) {
          const tSentence = transcribedList[0];
          if (tSentence.text && tSentence.text.trim().length > 0) {
            const updated: Sentence = {
              ...sentence,
              text: tSentence.text.trim(),
              translationPt: tSentence.translationPt || sentence.translationPt,
              words: tSentence.words || [],
            };

            this.sentences[phraseIndex] = updated;
            if (this.onPhraseUpdate) {
              this.onPhraseUpdate(updated);
            }
            this.completedIndices.add(phraseIndex);
            return;
          }
        }
      }

      // 2. Se não houver áudio ou se o áudio for silêncio acústico
      let text = sentence.text?.trim() || '';
      if (!text || isPlaceholderSentence(sentence)) {
        text = `Phrase ${phraseIndex + 1}: Speech audio segment`;
      }

      const rawWords = text.split(/\s+/).filter(Boolean);
      let wordCues = sentence.words && sentence.words.length > 0 ? sentence.words : [];

      if (wordCues.length === 0 && rawWords.length > 0) {
        wordCues = distributeWordTimestamps(rawWords, sentence.start, duration);
      }

      let translationPt = sentence.translationPt || '';
      const updated: Sentence = {
        ...sentence,
        text,
        translationPt,
        words: wordCues,
      };

      this.sentences[phraseIndex] = updated;
      if (this.onPhraseUpdate) {
        this.onPhraseUpdate(updated);
      }

      // Tradução em segundo plano se necessário
      if (!translationPt && text && !text.startsWith('Phrase ')) {
        fetch('/api/fast-translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data?.translatedText) {
              const withPt = { ...this.sentences[phraseIndex], translationPt: data.translatedText };
              this.sentences[phraseIndex] = withPt;
              if (this.onPhraseUpdate) {
                this.onPhraseUpdate(withPt);
              }
            }
          })
          .catch(() => {});
      }

      this.completedIndices.add(phraseIndex);
    } catch (err) {
      console.warn(`[PhraseLookAheadEngine] Aviso ao antecipar frase ${phraseIndex}:`, err);
    } finally {
      this.processingIndices.delete(phraseIndex);
      this.notifyQueueStatus();
    }
  }

  /**
   * Atualiza o texto transcrito de uma frase específica (ex: vindo da Web Speech API).
   */
  public updateSentenceTranscript(phraseIndex: number, text: string) {
    if (phraseIndex < 0 || phraseIndex >= this.sentences.length) return;
    const current = this.sentences[phraseIndex];
    const duration = Math.max(0.6, current.end - current.start);
    const words = text.split(/\s+/).filter(Boolean);
    const wordDur = duration / Math.max(1, words.length);

    const wordCues: WordCue[] = words.map((w, wIdx) => ({
      word: w,
      cleanWord: w.replace(/[^a-zA-Z0-9']/g, '').toLowerCase(),
      start: Number((current.start + wIdx * wordDur).toFixed(2)),
      end: Number((current.start + (wIdx + 1) * wordDur).toFixed(2)),
      index: wIdx,
    }));

    const updated: Sentence = {
      ...current,
      text: text.trim(),
      words: wordCues,
    };

    this.sentences[phraseIndex] = updated;
    this.completedIndices.add(phraseIndex);
    if (this.onPhraseUpdate) {
      this.onPhraseUpdate(updated);
    }
    this.notifyQueueStatus();
  }

  /**
   * Obtém a lista das frases ativas e próximas para exibição na UI com seus estados.
   */
  public getLookAheadQueueStatus(): LookAheadPhrase[] {
    return this.sentences.map((sentence, idx) => {
      let status: PhraseStatus = 'pending';
      const isAnticipated =
        this.currentPhraseIndex !== -1 &&
        idx > this.currentPhraseIndex &&
        idx <= this.currentPhraseIndex + this.lookAheadWindowSize;

      if (idx === this.currentPhraseIndex) {
        status = 'active';
      } else if (this.processingIndices.has(idx)) {
        status = 'processing';
      } else if (this.completedIndices.has(idx) || isAnticipated) {
        status = isAnticipated ? 'buffered' : 'completed';
      }

      return {
        sentence,
        status,
        progressPercent: status === 'completed' || status === 'buffered' ? 100 : status === 'processing' ? 50 : 0,
        isAnticipated,
      };
    });
  }

  private notifyQueueStatus() {
    if (this.onQueueStatus) {
      this.onQueueStatus(this.getLookAheadQueueStatus(), this.currentPhraseIndex);
    }
  }

  /**
   * Constrói frases e palavras a partir de segmentos acústicos gerados pela Web Audio API.
   * Se houver texto ou legendas fornecidas, alinha com tolerância. Se for áudio puro,
   * estrutura frases vazias prontas para transcrição individual progressiva.
   */
  public static buildSentencesFromAcousticSegments(
    segments: AcousticSegment[],
    providedTextOrSentences?: string[] | string
  ): Sentence[] {
    if (segments.length === 0) return [];

    let textSentences: string[] = [];
    if (Array.isArray(providedTextOrSentences)) {
      textSentences = providedTextOrSentences.filter((s) => s.trim().length > 0);
    } else if (typeof providedTextOrSentences === 'string' && providedTextOrSentences.trim().length > 0) {
      // Divide texto por pontuação preservando orações
      textSentences = providedTextOrSentences
        .split(/(?<=[.!?])\s+|\n+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }

    const hasText = textSentences.length > 0;

    return segments.map((seg, idx) => {
      let sentenceText = '';
      if (hasText) {
        // Distribui o texto proporcionalmente entre os segmentos acústicos
        const textIdx = Math.min(textSentences.length - 1, Math.floor((idx / segments.length) * textSentences.length));
        sentenceText = textSentences[textIdx] || '';
      } else {
        // Frase estruturada do trecho de fala acústico
        sentenceText = `Phrase ${idx + 1}: Speech audio segment`;
      }

      const rawWords = sentenceText.split(/\s+/).filter(Boolean);
      const segDuration = Math.max(0.5, seg.end - seg.start);
      const wordCues: WordCue[] = distributeWordTimestamps(rawWords, seg.start, segDuration);

      return {
        id: `acoustic-phrase-${idx + 1}`,
        index: idx,
        start: seg.start,
        end: seg.end,
        text: sentenceText,
        translationPt: hasText ? '' : `Trecho acústico #${idx + 1} (${segDuration.toFixed(1)}s)`,
        words: wordCues,
      };
    });
  }
}

/**
 * Utilitário para revelação progressiva palavra por palavra conforme o áudio toca.
 * Retorna quais palavras já foram ditas, a palavra falada no instante exato, e as palavras futuras.
 */
export function getProgressiveWordsState(
  words: WordCue[] = [],
  currentTime: number,
  sentenceStart: number,
  sentenceEnd: number
): {
  spokenWords: WordCue[];
  currentWord: WordCue | null;
  upcomingWords: WordCue[];
  revealedCount: number;
  totalWords: number;
} {
  if (!words || words.length === 0) {
    return {
      spokenWords: [],
      currentWord: null,
      upcomingWords: [],
      revealedCount: 0,
      totalWords: 0,
    };
  }

  const spokenWords: WordCue[] = [];
  let currentWord: WordCue | null = null;
  const upcomingWords: WordCue[] = [];

  for (const w of words) {
    if (currentTime >= w.start && currentTime <= w.end) {
      currentWord = w;
      spokenWords.push(w);
    } else if (currentTime > w.end) {
      spokenWords.push(w);
    } else {
      upcomingWords.push(w);
    }
  }

  return {
    spokenWords,
    currentWord,
    upcomingWords,
    revealedCount: spokenWords.length,
    totalWords: words.length,
  };
}
