// High-speed Audio Engine with Voice Selection (prioritizing Natural & English voices)

export interface BrowserVoice {
  name: string;
  lang: string;
  voiceURI: string;
  isNatural: boolean;
}

const VOICE_STORAGE_KEY = 'echolingo_preferred_voice';

class AudioEngine {
  private currentAudio: HTMLAudioElement | null = null;
  private ttsCache: Map<string, string> = new Map();
  private selectedVoiceURI: string = '';

  constructor() {
    if (typeof window !== 'undefined') {
      this.selectedVoiceURI = localStorage.getItem(VOICE_STORAGE_KEY) || '';
      if ('speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = () => {
          this.autoSelectBestVoice();
        };
      }
    }
  }

  /**
   * Get sorted list of English voices, with Natural voices first.
   */
  getAvailableVoices(): BrowserVoice[] {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return [];
    }

    const rawVoices = window.speechSynthesis.getVoices();
    // Filter for English voices
    const enVoices = rawVoices.filter(
      (v) => v.lang.toLowerCase().startsWith('en') || v.name.toLowerCase().includes('english')
    );

    // Sort: Voices with "Natural" first, then standard English voices
    enVoices.sort((a, b) => {
      const aNatural = a.name.toLowerCase().includes('natural');
      const bNatural = b.name.toLowerCase().includes('natural');
      if (aNatural && !bNatural) return -1;
      if (!aNatural && bNatural) return 1;
      return a.name.localeCompare(b.name);
    });

    return enVoices.map((v) => ({
      name: v.name,
      lang: v.lang,
      voiceURI: v.voiceURI,
      isNatural: v.name.toLowerCase().includes('natural'),
    }));
  }

  setSelectedVoice(voiceURI: string) {
    this.selectedVoiceURI = voiceURI;
    if (typeof window !== 'undefined') {
      localStorage.setItem(VOICE_STORAGE_KEY, voiceURI);
    }
  }

  getSelectedVoiceURI(): string {
    if (this.selectedVoiceURI) return this.selectedVoiceURI;
    const best = this.autoSelectBestVoice();
    return best?.voiceURI || '';
  }

  private autoSelectBestVoice(): SpeechSynthesisVoice | null {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;

    const rawVoices = window.speechSynthesis.getVoices();
    if (rawVoices.length === 0) return null;

    // Check saved preference
    const saved = localStorage.getItem(VOICE_STORAGE_KEY);
    if (saved) {
      const found = rawVoices.find((v) => v.voiceURI === saved);
      if (found) {
        this.selectedVoiceURI = found.voiceURI;
        return found;
      }
    }

    // Prefer Microsoft Natural English voices or Google US English
    const naturalVoice = rawVoices.find(
      (v) =>
        v.lang.toLowerCase().startsWith('en') &&
        v.name.toLowerCase().includes('natural')
    );

    const best =
      naturalVoice ||
      rawVoices.find(
        (v) =>
          v.lang.toLowerCase().startsWith('en') &&
          (v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Alex'))
      ) ||
      rawVoices.find((v) => v.lang.toLowerCase().startsWith('en')) ||
      rawVoices[0];

    if (best) {
      this.selectedVoiceURI = best.voiceURI;
    }
    return best || null;
  }

  /**
   * Play speech. Defaults to instant, zero-latency Web Speech API using user's chosen voice.
   */
  async speakText(
    text: string,
    options?: { rate?: number; voiceURI?: string; slow?: boolean; audioUrl?: string; useAI?: boolean }
  ): Promise<void> {
    const rate = options?.slow ? 0.75 : options?.rate || 1.0;

    // 1. If human recording audio URL is provided from Dictionary API, play it directly
    if (options?.audioUrl) {
      try {
        return await this.playAudioUrl(options.audioUrl, rate);
      } catch (e) {
        console.warn('Direct audioUrl failed, falling back to speech synthesis', e);
      }
    }

    // 2. Standard Web Speech API (Local, Zero-latency, High-Fidelity Natural Voice)
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) {
        resolve();
        return;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = rate;

      const rawVoices = window.speechSynthesis.getVoices();
      const targetVoiceURI = options?.voiceURI || this.selectedVoiceURI || this.getSelectedVoiceURI();
      const chosenVoice =
        rawVoices.find((v) => v.voiceURI === targetVoiceURI) ||
        this.autoSelectBestVoice();

      if (chosenVoice) {
        utterance.voice = chosenVoice;
      }

      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();

      window.speechSynthesis.speak(utterance);
    });
  }

  stopTTS() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
  }

  playAudioUrl(url: string, rate: number = 1.0): Promise<void> {
    return new Promise((resolve, reject) => {
      this.stopTTS();
      const audio = new Audio(url);
      audio.playbackRate = rate;
      this.currentAudio = audio;

      audio.onended = () => {
        this.currentAudio = null;
        resolve();
      };
      audio.onerror = (e) => {
        this.currentAudio = null;
        resolve();
      };
      audio.play().catch(() => resolve());
    });
  }
}

export const audioEngine = new AudioEngine();
