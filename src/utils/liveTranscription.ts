import { Sentence, WordCue } from '../types';

export interface LiveTranscriptCue {
  text: string;
  start: number;
  end: number;
}

class LiveTranscriptionService {
  private recognition: any = null;
  private isListening: boolean = false;
  private shouldBeListening: boolean = false;
  private restartTimer: any = null;
  private onTranscriptCallback: ((text: string, isFinal: boolean) => void) | null = null;

  constructor() {
    this.initRecognition();
  }

  private initRecognition() {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';

        this.recognition.onresult = (event: any) => {
          let interimTranscript = '';
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript;
            } else {
              interimTranscript += transcript;
            }
          }

          if (finalTranscript && this.onTranscriptCallback) {
            this.onTranscriptCallback(finalTranscript.trim(), true);
          } else if (interimTranscript && this.onTranscriptCallback) {
            this.onTranscriptCallback(interimTranscript.trim(), false);
          }
        };

        this.recognition.onerror = (e: any) => {
          console.warn('SpeechRecognition notice:', e.error);
          if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
            this.shouldBeListening = false;
            this.isListening = false;
          }
        };

        this.recognition.onend = () => {
          this.isListening = false;
          // Chrome terminates recognition after short silence; auto-restart if user still wants it active
          if (this.shouldBeListening) {
            clearTimeout(this.restartTimer);
            this.restartTimer = setTimeout(() => {
              if (this.shouldBeListening) {
                try {
                  this.recognition.start();
                  this.isListening = true;
                } catch (err) {
                  // If it throws InvalidState, re-init
                  console.warn('Speech recognition restart caught:', err);
                }
              }
            }, 300);
          }
        };
      }
    }
  }

  isSupported(): boolean {
    return Boolean(this.recognition);
  }

  startListening(callback: (text: string, isFinal: boolean) => void) {
    if (!this.recognition) return;
    this.shouldBeListening = true;
    this.onTranscriptCallback = callback;

    if (!this.isListening) {
      try {
        this.recognition.start();
        this.isListening = true;
      } catch (e) {
        console.warn('Speech recognition already active or warming up:', e);
        this.isListening = true;
      }
    }
  }

  stopListening() {
    this.shouldBeListening = false;
    clearTimeout(this.restartTimer);
    if (!this.recognition) return;
    try {
      this.recognition.stop();
    } catch {}
    this.isListening = false;
    this.onTranscriptCallback = null;
  }

  /**
   * Fast Non-AI Subtitle & Script Parser (.srt, .vtt, or plain text)
   * Converts any reference text or subtitles directly into timed sentences in 0ms!
   */
  parseTextToTimedSentences(text: string, totalDuration: number): Sentence[] {
    // Check if it's an SRT subtitle
    if (text.includes('-->')) {
      const srtRegex =
        /(\d+)\s*\n(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*\n([\s\S]*?)(?=\n\s*\n|\s*$)/g;
      const srtResults: Sentence[] = [];
      let match;

      const parseTime = (timeStr: string) => {
        const parts = timeStr.replace(',', '.').split(':');
        const h = parseFloat(parts[0]);
        const m = parseFloat(parts[1]);
        const s = parseFloat(parts[2]);
        return h * 3600 + m * 60 + s;
      };

      let idx = 0;
      while ((match = srtRegex.exec(text)) !== null) {
        const start = parseTime(match[2]);
        const end = parseTime(match[3]);
        const cleanText = match[4].replace(/<[^>]*>/g, '').replace(/\r?\n/g, ' ').trim();
        if (cleanText) {
          const rawWords = cleanText.split(/\s+/);
          const wordDur = (end - start) / rawWords.length;
          srtResults.push({
            id: `srt-${idx}`,
            index: idx,
            start,
            end,
            text: cleanText,
            translationPt: '',
            words: rawWords.map((w, wIdx) => ({
              word: w,
              cleanWord: w.replace(/[^a-zA-Z0-9']/g, '').toLowerCase(),
              start: +(start + wIdx * wordDur).toFixed(2),
              end: +(start + (wIdx + 1) * wordDur).toFixed(2),
              index: wIdx,
            })),
          });
          idx++;
        }
      }

      if (srtResults.length > 0) return srtResults;
    }

    // Plain text / book paragraphs: split into natural sentences
    const rawSentences = text
      .replace(/\r\n/g, '\n')
      .split(/(?<=[.?!])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 5);

    if (rawSentences.length === 0) return [];

    const timePerSentence = totalDuration / rawSentences.length;

    return rawSentences.map((sentText, sIdx) => {
      const sStart = +(sIdx * timePerSentence).toFixed(2);
      const sEnd = +((sIdx + 1) * timePerSentence).toFixed(2);
      const words = sentText.split(/\s+/);
      const wordDuration = (sEnd - sStart) / words.length;

      return {
        id: `sent-${sIdx}`,
        index: sIdx,
        start: sStart,
        end: sEnd,
        text: sentText,
        translationPt: '',
        words: words.map((w, wIdx) => ({
          word: w,
          cleanWord: w.replace(/[^a-zA-Z0-9']/g, '').toLowerCase(),
          start: +(sStart + wIdx * wordDuration).toFixed(2),
          end: +(sStart + (wIdx + 1) * wordDuration).toFixed(2),
          index: wIdx,
        })),
      };
    });
  }

  /**
   * Convert raw recognized speech text into a structured timed Sentence with word cues
   */
  createSentenceFromSpeech(
    text: string,
    startTime: number,
    endTime: number,
    idx: number = 0
  ): Sentence {
    const cleanText = text.trim();
    const rawWords = cleanText.split(/\s+/).filter(Boolean);
    const duration = Math.max(0.5, endTime - startTime);
    const wordDur = duration / Math.max(1, rawWords.length);

    return {
      id: `speech-${Date.now()}-${idx}`,
      index: idx,
      start: +startTime.toFixed(2),
      end: +endTime.toFixed(2),
      text: cleanText,
      translationPt: '',
      words: rawWords.map((w, wIdx) => ({
        word: w,
        cleanWord: w.replace(/[^a-zA-Z0-9']/g, '').toLowerCase(),
        start: +(startTime + wIdx * wordDur).toFixed(2),
        end: +(startTime + (wIdx + 1) * wordDur).toFixed(2),
        index: wIdx,
      })),
    };
  }

  /**
   * Generate lightweight progressive timeframes across the real duration of the audio
   */
  generateInitialTimeframes(totalDuration: number, chapterTitle: string): Sentence[] {
    const chunkDuration = 20; // 20-second agile listening blocks
    const count = Math.max(1, Math.ceil(totalDuration / chunkDuration));
    const results: Sentence[] = [];

    for (let i = 0; i < count; i++) {
      const start = i * chunkDuration;
      const end = Math.min((i + 1) * chunkDuration, totalDuration);
      const startMin = Math.floor(start / 60);
      const startSec = Math.floor(start % 60);
      const endMin = Math.floor(end / 60);
      const endSec = Math.floor(end % 60);

      const placeholderText = `${chapterTitle} [${startMin}:${startSec < 10 ? '0' : ''}${startSec} - ${endMin}:${endSec < 10 ? '0' : ''}${endSec}]`;

      results.push({
        id: `chunk-${i}`,
        index: i,
        start,
        end,
        text: placeholderText,
        translationPt: `Trecho em reprodução (${startMin}:${startSec < 10 ? '0' : ''}${startSec} até ${endMin}:${endSec < 10 ? '0' : ''}${endSec})`,
        words: [
          { word: chapterTitle.split(' ')[0] || 'Audio', cleanWord: 'audio', start, end: +(start + (end - start) * 0.3).toFixed(2), index: 0 },
          { word: 'playback', cleanWord: 'playback', start: +(start + (end - start) * 0.3).toFixed(2), end: +(start + (end - start) * 0.6).toFixed(2), index: 1 },
          { word: `[${startMin}:${startSec < 10 ? '0' : ''}${startSec}]`, cleanWord: 'time', start: +(start + (end - start) * 0.6).toFixed(2), end, index: 2 },
        ],
      });
    }

    return results;
  }
}

export const liveTranscriber = new LiveTranscriptionService();
