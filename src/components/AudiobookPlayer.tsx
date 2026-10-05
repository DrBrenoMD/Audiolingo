import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Repeat,
  Volume2,
  Sparkles,
  BookOpen,
  BookmarkPlus,
  Eye,
  EyeOff,
  Gauge,
  HelpCircle,
  Mic,
  Languages,
  Check,
  ListOrdered,
  ChevronRight,
  ChevronLeft,
  FolderOpen,
  Radio,
  Loader2,
  Wand2,
  AlertTriangle,
} from 'lucide-react';
import { Audiobook, Sentence, WordCue, SRSFlashcard, Chapter } from '../types';
import { audioEngine } from '../utils/audioEngine';
import { chunkTranscriber } from '../utils/chunkAudioTranscriber';
import { adjustSentenceSync, snapSentenceToCurrentTime, isPlaceholderSentence } from '../utils/fuzzyAligner';
import { SidePanel, SidePanelMode } from './SidePanel';
import confetti from 'canvas-confetti';

interface AudiobookPlayerProps {
  audiobook: Audiobook;
  onSaveToSRS: (card: Partial<SRSFlashcard>) => void;
  onNavigateToSpeaking: (sentenceText: string) => void;
  onSelectAudiobook: (book: Audiobook) => void;
  allAudiobooks: Audiobook[];
  onAudiobookCreated: (newBook: Audiobook) => void;
  onOpenMediaGallery?: () => void;
}

export const AudiobookPlayer: React.FC<AudiobookPlayerProps> = ({
  audiobook,
  onSaveToSRS,
  onNavigateToSpeaking,
  onSelectAudiobook,
  allAudiobooks,
  onAudiobookCreated,
  onOpenMediaGallery,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [realDuration, setRealDuration] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [showPortuguese, setShowPortuguese] = useState<boolean>(true);
  const [blurEnglish, setBlurEnglish] = useState<boolean>(false);
  const [repeatSentenceMode, setRepeatSentenceMode] = useState<boolean>(false);
  const [savedSentenceId, setSavedSentenceId] = useState<string | null>(null);

  // Progressive JIT Transcription State
  const [autoTranscribeActive, setAutoTranscribeActive] = useState<boolean>(true);
  const [batchTranscribing, setBatchTranscribing] = useState<boolean>(false);
  const [transcribingSlices, setTranscribingSlices] = useState<Set<number>>(new Set());

  // Dynamic sentence store allowing progressive updates to the current chapter
  const [currentChapterIdx, setCurrentChapterIdx] = useState<number>(
    audiobook.currentChapterIndex || 0
  );
  const [dynamicSentences, setDynamicSentences] = useState<Sentence[]>([]);

  // UNIFIED SIDE PANEL STATE (Never covers text!)
  const [sidePanelMode, setSidePanelMode] = useState<SidePanelMode | null>(null);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [selectedSentenceText, setSelectedSentenceText] = useState<string>('');
  const [selectedSentencePt, setSelectedSentencePt] = useState<string>('');
  const [grammarSentence, setGrammarSentence] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const activeWordRef = useRef<HTMLSpanElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playTimerRef = useRef<number | null>(null);

  const currentChapter: Chapter | undefined = audiobook.chapters?.[currentChapterIdx];
  const activeAudioSrc: string = currentChapter?.audioUrl || audiobook.audioUrl || '';

  // Synchronize sentences when chapter or audiobook changes
  useEffect(() => {
    setCurrentChapterIdx(audiobook.currentChapterIndex || 0);
    setCurrentTime(0);
    setRealDuration(0);
    setIsPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    const raw = currentChapter?.sentences || audiobook.sentences || [];
    // Sanitize any placeholders so they don't have fake word cues
    const sanitized = raw.map((s) => (isPlaceholderSentence(s) ? { ...s, words: [] } : s));
    setDynamicSentences(sanitized);

    // Automatically kick off transcription for the first chunk if needed
    if (activeAudioSrc && sanitized.some((s) => isPlaceholderSentence(s))) {
      transcribeSliceAtTime(0);
    }
  }, [audiobook.id, currentChapterIdx, activeAudioSrc]);

  // Synchronize playback speed with audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Real duration calculation (100% exact from audio hardware or chapter metadata)
  const displayDuration =
    realDuration > 0
      ? realDuration
      : currentChapter?.duration || audiobook.duration || 60;

  // Active sentence & word
  const activeSentenceIndex = dynamicSentences.findIndex(
    (s) => currentTime >= s.start && currentTime <= s.end
  );
  const activeSentence =
    activeSentenceIndex !== -1 ? dynamicSentences[activeSentenceIndex] : null;

  const activeWordCue = activeSentence?.words.find(
    (w) => currentTime >= w.start && currentTime <= w.end
  );

  // Auto-scroll active word into view smoothly
  useEffect(() => {
    if (activeWordRef.current && isPlaying) {
      activeWordRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'center',
      });
    }
  }, [activeWordCue?.word, isPlaying]);

  // Function to transcribe a specific 20s slice on the fly
  const transcribeSliceAtTime = async (sliceStartSec: number) => {
    if (!activeAudioSrc) return;
    if (transcribingSlices.has(sliceStartSec)) return;

    setTranscribingSlices((prev) => new Set(prev).add(sliceStartSec));

    try {
      const newSentences = await chunkTranscriber.transcribeSlice(activeAudioSrc, sliceStartSec, 20);
      if (newSentences && newSentences.length > 0) {
        setDynamicSentences((prev) => {
          // Filter out placeholder chunks in this time window and replace with real transcription
          const filtered = prev.filter(
            (s) => !(s.start >= sliceStartSec - 0.5 && s.end <= sliceStartSec + 20.5 && isPlaceholderSentence(s))
          );
          const merged = [...filtered, ...newSentences].sort((a, b) => a.start - b.start);
          return merged;
        });
      }
    } catch (err) {
      console.warn('Error transcribing slice', sliceStartSec, err);
    } finally {
      setTranscribingSlices((prev) => {
        const next = new Set(prev);
        next.delete(sliceStartSec);
        return next;
      });
    }
  };

  // Proactive Lookahead Prefetching: Transcribes current chunk AND upcoming chunks ahead of time!
  useEffect(() => {
    if (autoTranscribeActive && activeAudioSrc) {
      const currentSlice = Math.floor(currentTime / 20) * 20;
      // Proactively prefetch current slice + next 2 slices in advance (up to 40-60s ahead!)
      const slicesToPrefetch = [
        currentSlice,
        currentSlice + 20,
        currentSlice + 40,
      ].filter((s) => s < displayDuration);

      slicesToPrefetch.forEach((sliceStart) => {
        const isPlaceholder = dynamicSentences.some(
          (s) =>
            s.start >= sliceStart - 0.5 &&
            s.end <= sliceStart + 20.5 &&
            isPlaceholderSentence(s)
        );

        if (isPlaceholder && !chunkTranscriber.hasCachedChunk(activeAudioSrc, sliceStart, 20)) {
          transcribeSliceAtTime(sliceStart);
        }
      });
    }
  }, [isPlaying, autoTranscribeActive, Math.floor(currentTime / 6), activeAudioSrc, displayDuration, dynamicSentences.length]);

  // Transcribe whole chapter in the background sequentially
  const handleTranscribeWholeChapterInBackground = async () => {
    if (!activeAudioSrc || batchTranscribing) return;
    setBatchTranscribing(true);
    try {
      const totalDur = displayDuration;
      const slicesCount = Math.ceil(totalDur / 20);
      for (let i = 0; i < slicesCount; i++) {
        const start = i * 20;
        await transcribeSliceAtTime(start);
      }
    } finally {
      setBatchTranscribing(false);
    }
  };

  // Play / Pause toggle
  const togglePlay = () => {
    if (!isPlaying) {
      if (audioRef.current && activeAudioSrc) {
        if (currentTime >= displayDuration) {
          audioRef.current.currentTime = 0;
        }
        audioRef.current.play().catch((err) => console.warn('Audio play error:', err));
      }
      setIsPlaying(true);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setIsPlaying(false);
    }
  };

  const seek = (time: number) => {
    const clamped = Math.max(0, Math.min(time, displayDuration));
    setCurrentTime(clamped);
    if (audioRef.current && isFinite(clamped)) {
      audioRef.current.currentTime = clamped;
    }
  };

  const jumpSentence = (delta: number) => {
    let nextIdx = activeSentenceIndex + delta;
    if (nextIdx < 0) nextIdx = 0;
    if (nextIdx >= dynamicSentences.length) nextIdx = dynamicSentences.length - 1;
    const target = dynamicSentences[nextIdx];
    if (target) {
      seek(target.start);
    }
  };

  const switchChapter = (index: number) => {
    if (index >= 0 && audiobook.chapters && index < audiobook.chapters.length) {
      setCurrentChapterIdx(index);
      setCurrentTime(0);
      setRealDuration(0);
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
      }
    }
  };

  // Click on word opens SIDE PANEL without covering text!
  const handleWordClick = (wordCue: WordCue, sentence: Sentence) => {
    setSelectedWord(wordCue.cleanWord);
    setSelectedSentenceText(sentence.text);
    setSelectedSentencePt(sentence.translationPt);
    setSidePanelMode('word');
  };

  // Click on grammar opens SIDE PANEL without covering text!
  const handleGrammarClick = (sentenceText: string) => {
    setGrammarSentence(sentenceText);
    setSidePanelMode('grammar');
  };

  // Add full sentence to SRS
  const handleSaveSentenceToDeck = (sentence: Sentence) => {
    onSaveToSRS({
      type: 'sentence',
      frontText: sentence.text,
      backTranslation: sentence.translationPt,
      notes: `Audiolivro: ${audiobook.title} ${
        currentChapter ? `• ${currentChapter.title}` : ''
      }`,
      audiobookTitle: audiobook.title,
    });
    setSavedSentenceId(sentence.id);
    confetti({
      particleCount: 25,
      spread: 60,
      origin: { y: 0.8 },
      colors: ['#6366f1', '#10b981'],
    });
    setTimeout(() => setSavedSentenceId(null), 2500);
  };

  // Nudge sentence timing to compensate for narration/text discrepancies
  const handleNudgeSentence = (sentenceIdx: number, delta: number) => {
    setDynamicSentences((prev) => adjustSentenceSync(prev, sentenceIdx, delta));
  };

  const handleSnapSentence = (sentenceIdx: number) => {
    setDynamicSentences((prev) => snapSentenceToCurrentTime(prev, sentenceIdx, currentTime));
  };

  const formatTime = (secs: number) => {
    if (!isFinite(secs) || isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 relative">
      {/* Real HTML5 Audio Element with Duration Synchronization */}
      {activeAudioSrc && (
        <audio
          ref={audioRef}
          src={activeAudioSrc}
          preload="metadata"
          onLoadedMetadata={() => {
            if (audioRef.current && isFinite(audioRef.current.duration) && audioRef.current.duration > 0) {
              setRealDuration(audioRef.current.duration);
            }
          }}
          onDurationChange={() => {
            if (audioRef.current && isFinite(audioRef.current.duration) && audioRef.current.duration > 0) {
              setRealDuration(audioRef.current.duration);
            }
          }}
          onTimeUpdate={() => {
            if (audioRef.current) {
              const cur = audioRef.current.currentTime;
              setCurrentTime(cur);
              if (repeatSentenceMode && activeSentence && cur >= activeSentence.end) {
                audioRef.current.currentTime = activeSentence.start;
              }
            }
          }}
          onEnded={() => {
            if (audiobook.chapters && currentChapterIdx < audiobook.chapters.length - 1) {
              switchChapter(currentChapterIdx + 1);
            } else {
              setIsPlaying(false);
            }
          }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />
      )}

      {/* Top Header & Navigation Bar */}
      <div className="px-6 py-4 border-b border-slate-800/80 bg-slate-900/60 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <img
            src={audiobook.coverUrl}
            alt={audiobook.title}
            className="w-14 h-14 rounded-xl object-cover shadow-lg shadow-indigo-950/40 border border-slate-700/60"
          />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white font-serif">{audiobook.title}</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {audiobook.level}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {audiobook.author} • {audiobook.category}
            </p>
          </div>
        </div>

        {/* Audiobook & Side Tools Triggers */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Progressive JIT Auto-Transcribe Switch */}
          {activeAudioSrc && (
            <button
              onClick={() => setAutoTranscribeActive(!autoTranscribeActive)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${
                autoTranscribeActive
                  ? 'bg-emerald-600/30 text-emerald-300 border-emerald-500/60'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border-slate-700'
              }`}
              title="Transcrever automaticamente conforme a reprodução avança (trecho a trecho)"
            >
              <Radio className={`w-3.5 h-3.5 ${autoTranscribeActive ? 'animate-pulse text-emerald-400' : ''}`} />
              <span>{autoTranscribeActive ? 'Transcrição Conforme Toca: On' : 'Transcrição ao Tocar: Off'}</span>
            </button>
          )}

          {/* Background Batch Chapter Transcribe */}
          {activeAudioSrc && (
            <button
              onClick={handleTranscribeWholeChapterInBackground}
              disabled={batchTranscribing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-indigo-950 text-indigo-300 hover:text-white text-xs font-semibold rounded-lg border border-slate-700 transition"
              title="Transcrever todos os blocos de 20s do capítulo em segundo plano"
            >
              {batchTranscribing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                  <span>Transcrevendo...</span>
                </>
              ) : (
                <>
                  <Wand2 className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Transcrever Capítulo</span>
                </>
              )}
            </button>
          )}

          {audiobook.chapters && audiobook.chapters.length > 0 && (
            <button
              onClick={() => setSidePanelMode(sidePanelMode === 'chapters' ? null : 'chapters')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${
                sidePanelMode === 'chapters'
                  ? 'bg-purple-600/30 text-purple-300 border-purple-500'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
              title="Abrir índice de capítulos na barra lateral"
            >
              <ListOrdered className="w-3.5 h-3.5 text-purple-400" />
              <span>
                Capítulo {currentChapterIdx + 1}/{audiobook.chapters.length}
              </span>
            </button>
          )}

          {/* Voice Selector button */}
          <button
            onClick={() => setSidePanelMode(sidePanelMode === 'voice' ? null : 'voice')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${
              sidePanelMode === 'voice'
                ? 'bg-teal-600/30 text-teal-300 border-teal-500'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
            title="Abrir seletor de voz na barra lateral"
          >
            <Volume2 className="w-3.5 h-3.5 text-teal-400" />
            <span className="hidden sm:inline">Voz do Navegador</span>
            <span className="sm:hidden">Voz</span>
          </button>

          {/* Book Dropdown */}
          <select
            value={audiobook.id}
            onChange={(e) => {
              const selected = allAudiobooks.find((b) => b.id === e.target.value);
              if (selected) {
                setIsPlaying(false);
                setCurrentTime(0);
                onSelectAudiobook(selected);
              }
            }}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition"
          >
            {allAudiobooks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title} ({b.level})
              </option>
            ))}
          </select>

          {/* Media Gallery Button */}
          {onOpenMediaGallery && (
            <button
              onClick={onOpenMediaGallery}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 transition flex items-center gap-1.5 font-medium"
              title="Abrir Galeria de Mídias para gerenciar, editar e excluir audiolivros"
            >
              <FolderOpen className="w-3.5 h-3.5 text-indigo-400" />
              <span>Galeria</span>
            </button>
          )}

          {/* Upload Button */}
          <button
            onClick={() => setSidePanelMode(sidePanelMode === 'upload' ? null : 'upload')}
            className={`text-xs px-3 py-1.5 rounded-lg border transition flex items-center gap-1.5 font-medium ${
              sidePanelMode === 'upload'
                ? 'bg-indigo-600 text-white border-indigo-500'
                : 'bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border-indigo-500/30'
            }`}
            title="Importar novos áudios ou pastas na barra lateral"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Upload Pasta/MP3</span>
          </button>
        </div>
      </div>

      {/* Chapter Indicator Bar if multi-chapter */}
      {audiobook.chapters && audiobook.chapters.length > 1 && (
        <div className="px-6 py-2 bg-indigo-950/30 border-b border-indigo-900/30 flex items-center justify-between text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-indigo-400">Faixa Atual:</span>
            <span className="text-white font-medium">
              {currentChapter?.title || `Capítulo ${currentChapterIdx + 1}`}
            </span>
            {currentChapter?.fileName && (
              <span className="text-[11px] text-slate-500 font-mono">({currentChapter.fileName})</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => switchChapter(currentChapterIdx - 1)}
              disabled={currentChapterIdx === 0}
              className="p-1 text-slate-400 hover:text-white disabled:opacity-30 transition"
              title="Capítulo Anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-mono text-[11px] text-slate-400">
              {currentChapterIdx + 1} de {audiobook.chapters.length}
            </span>
            <button
              onClick={() => switchChapter(currentChapterIdx + 1)}
              disabled={currentChapterIdx === audiobook.chapters.length - 1}
              className="p-1 text-slate-400 hover:text-white disabled:opacity-30 transition"
              title="Próximo Capítulo"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Side-by-Side Area: Text on Left (NEVER COVERED), Side Panel on Right */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main Reading & Transcript Area */}
        <div
          ref={containerRef}
          className="flex-1 overflow-y-auto px-6 pt-6 pb-32 space-y-6 max-w-4xl mx-auto w-full custom-scrollbar"
        >
          {/* Vercel 404 Diagnostics Banner */}
          {chunkTranscriber.has404Error && (
            <div className="p-4 rounded-xl bg-amber-950/50 border border-amber-600/60 text-xs text-amber-200 space-y-2">
              <div className="font-bold flex items-center gap-2 text-amber-300 text-sm">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Configuração de Backend no Vercel Necessária</span>
              </div>
              <p className="text-amber-200/90 leading-relaxed">
                A rota <code className="bg-amber-900/60 px-1 py-0.5 rounded font-mono text-amber-100">/api/transcribe-chunk</code> retornou <strong>404</strong> no seu domínio da Vercel (<code className="font-mono text-amber-100">audiolingo-nu.vercel.app</code>).
              </p>
              <div className="bg-slate-900/60 p-2.5 rounded-lg border border-amber-800/40 text-[11px] space-y-1">
                <p className="font-semibold text-white">Como resolver no seu Vercel:</p>
                <p>1. O arquivo <code className="text-indigo-300 font-mono">vercel.json</code> e a rota serverless <code className="text-indigo-300 font-mono">api/index.ts</code> estão configurados no repositório.</p>
                <p>2. Para transcrição Whisper ASR ultra-rápida, você pode adicionar <code className="text-indigo-300 font-mono">GROQ_API_KEY</code> em <strong>Settings → Environment Variables</strong> na Vercel.</p>
                <p>3. Faça um novo <strong>Deploy</strong> (ou commit/push) para a Vercel compilar o backend serverless.</p>
              </div>
            </div>
          )}

          {/* Prompt Banner */}
          <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80 text-xs text-slate-400 flex items-start justify-between gap-4">
            <div className="flex items-start gap-2">
              <HelpCircle className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-slate-300">Transcrição Ágil em Chunks: </span>
                O áudio toca imediatamente com duração real ({formatTime(displayDuration)}).
                Conforme você ouve, cada trecho de 20s é fatiado e transcrito automaticamente em segundo plano.
              </div>
            </div>
          </div>

          {/* Sentences / Timeframes List */}
          <div className="space-y-6">
            {dynamicSentences.map((sentence, sIdx) => {
              const isCurrentSentence = activeSentenceIndex === sIdx;
              const sliceStart = Math.floor(sentence.start / 20) * 20;
              const isChunkTranscribing = transcribingSlices.has(sliceStart);
              const isPlaceholder = isPlaceholderSentence(sentence);

              return (
                <div
                  key={sentence.id || sIdx}
                  className={`group relative p-4 rounded-2xl transition-all duration-300 border ${
                    isCurrentSentence
                      ? 'bg-slate-900/90 border-indigo-500/50 shadow-xl shadow-indigo-950/20'
                      : 'bg-slate-900/20 border-slate-800/40 hover:bg-slate-900/50 hover:border-slate-800'
                  }`}
                >
                  {/* Sentence Header Actions */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    {/* Sentence Timestamp & Sync Tuning */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        onClick={() => seek(sentence.start)}
                        className={`text-[11px] font-mono px-2 py-0.5 rounded transition ${
                          isCurrentSentence
                            ? 'bg-indigo-600 text-white font-semibold'
                            : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                        title="Pular áudio para este trecho"
                      >
                        {formatTime(sentence.start)}
                      </button>
                      {isCurrentSentence && (
                        <span className="flex h-2 w-2 relative">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                        </span>
                      )}

                      {/* Sync Fine-Tuning for Audio-Text Discrepancies */}
                      <div className="flex items-center gap-1 border-l border-slate-800 pl-1.5 ml-0.5">
                        <button
                          onClick={() => handleNudgeSentence(sIdx, -0.5)}
                          className="px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded transition font-mono"
                          title="Adiantar este trecho em 0.5s"
                        >
                          -0.5s
                        </button>
                        <button
                          onClick={() => handleNudgeSentence(sIdx, +0.5)}
                          className="px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded transition font-mono"
                          title="Atrasar este trecho em 0.5s"
                        >
                          +0.5s
                        </button>
                        <button
                          onClick={() => handleSnapSentence(sIdx)}
                          className="px-1.5 py-0.5 text-[10px] text-indigo-300 hover:text-white bg-indigo-950/60 hover:bg-indigo-900 border border-indigo-800/40 rounded transition"
                          title="Alinhar início desta frase exatamente ao segundo atual do áudio"
                        >
                          🎯 Alinhar Aqui
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition">
                      {/* One-click manual chunk transcribe button if placeholder */}
                      {isPlaceholder && (
                        <button
                          onClick={() => transcribeSliceAtTime(sliceStart)}
                          disabled={isChunkTranscribing}
                          className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-emerald-300 bg-emerald-950/40 hover:bg-emerald-950 border border-emerald-800/60 rounded transition"
                          title="Transcrever este trecho específico de 20s"
                        >
                          {isChunkTranscribing ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
                              <span>Processando...</span>
                            </>
                          ) : (
                            <>
                              <Wand2 className="w-3 h-3 text-emerald-400" />
                              <span>Transcrever Trecho (20s)</span>
                            </>
                          )}
                        </button>
                      )}

                      <button
                        onClick={() => audioEngine.speakText(sentence.text)}
                        className="p-1.5 text-slate-400 hover:text-indigo-300 hover:bg-slate-800 rounded transition"
                        title="Ouvir esta frase com a voz escolhida"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleGrammarClick(sentence.text)}
                        className="flex items-center gap-1 px-2 py-1 text-[11px] text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 rounded transition"
                        title="Abrir análise gramatical na barra lateral"
                      >
                        <Sparkles className="w-3 h-3 text-indigo-400" />
                        <span>Gramática</span>
                      </button>

                      <button
                        onClick={() => onNavigateToSpeaking(sentence.text)}
                        className="flex items-center gap-1 px-2 py-1 text-[11px] text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 rounded transition"
                        title="Praticar pronúncia no Speaking Lab"
                      >
                        <Mic className="w-3 h-3 text-emerald-400" />
                        <span>Speaking</span>
                      </button>

                      <button
                        onClick={() => handleSaveSentenceToDeck(sentence)}
                        className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded transition ${
                          savedSentenceId === sentence.id
                            ? 'bg-emerald-600 text-white font-medium'
                            : 'bg-slate-800/80 hover:bg-indigo-950 hover:text-indigo-300 text-slate-400'
                        }`}
                        title="Salvar frase completa no baralho SRS"
                      >
                        {savedSentenceId === sentence.id ? (
                          <>
                            <Check className="w-3 h-3" />
                            <span>Salvo</span>
                          </>
                        ) : (
                          <>
                            <BookmarkPlus className="w-3 h-3" />
                            <span>Salvar Frase SRS</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* English Text with Clickable Words */}
                  <p
                    className={`text-lg sm:text-xl font-serif leading-relaxed tracking-wide transition ${
                      blurEnglish ? 'blur-sm select-none hover:blur-none transition-all' : ''
                    }`}
                  >
                    {isChunkTranscribing ? (
                      <span className="flex items-center gap-2 text-indigo-300 text-sm font-sans animate-pulse py-1">
                        <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                        <span>Fatiando e transcrevendo áudio deste trecho ({formatTime(sentence.start)} - {formatTime(sentence.end)})...</span>
                      </span>
                    ) : isPlaceholder ? (
                      <span className="text-slate-400 font-sans text-sm italic flex items-center justify-between py-1">
                        <span className="flex items-center gap-2 text-indigo-300/80">
                          <Radio className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                          <span>
                            {sentence.text.startsWith('Audiobook narration segment')
                              ? `Trecho de áudio (${formatTime(sentence.start)} - ${formatTime(sentence.end)}) • Aguardando transcrição automática...`
                              : sentence.text}
                          </span>
                        </span>
                      </span>
                    ) : sentence.words && sentence.words.length > 0 ? (
                      sentence.words.map((cue, wIdx) => {
                        const isWordActive =
                          currentTime >= cue.start && currentTime <= cue.end;
                        const isWordSelected = selectedWord === cue.cleanWord;

                        return (
                          <React.Fragment key={wIdx}>
                            <span
                              ref={isWordActive ? activeWordRef : null}
                              onClick={() => handleWordClick(cue, sentence)}
                              className={`inline cursor-pointer select-text transition-colors duration-75 rounded px-1 -mx-0.5 py-0.5 ${
                                isWordActive
                                  ? 'bg-amber-400/35 text-amber-100 ring-1 ring-amber-400/60 shadow-sm'
                                  : isWordSelected
                                  ? 'bg-emerald-500/30 text-emerald-200 underline underline-offset-4 decoration-emerald-400'
                                  : 'hover:bg-slate-800/80 text-slate-200'
                              }`}
                              title="Clique para abrir dicionário instantâneo (0ms)"
                            >
                              {cue.word}
                            </span>{' '}
                          </React.Fragment>
                        );
                      })
                    ) : (
                      <span className="text-slate-400 font-sans text-sm italic flex items-center justify-between">
                        <span>{sentence.text}</span>
                      </span>
                    )}
                  </p>

                  {/* Subtitle / Portuguese Translation */}
                  {showPortuguese && sentence.translationPt && !isPlaceholder && (
                    <p className="mt-2 text-sm text-slate-400 italic font-sans leading-relaxed border-t border-slate-800/50 pt-1.5 flex items-start gap-1.5">
                      <span className="text-[10px] uppercase font-bold text-slate-500 not-italic tracking-wider mt-0.5">
                        PT:
                      </span>
                      <span>{sentence.translationPt}</span>
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* DOCKED SIDE PANEL (NEVER COVERS THE TEXT!) */}
        {sidePanelMode && (
          <SidePanel
            mode={sidePanelMode}
            onClose={() => setSidePanelMode(null)}
            audiobook={audiobook}
            currentChapterIdx={currentChapterIdx}
            onSelectChapter={(idx) => switchChapter(idx)}
            word={selectedWord}
            contextSentence={selectedSentenceText}
            sentenceTranslationPt={selectedSentencePt}
            onInspectNewWord={(w) => setSelectedWord(w)}
            onPracticeSpeakingWord={(w) => onNavigateToSpeaking(w)}
            grammarSentence={grammarSentence}
            onSaveToSRS={onSaveToSRS}
            onAudiobookCreated={onAudiobookCreated}
          />
        )}
      </div>

      {/* Persistent Bottom Control Bar with ACCURATE Scrubber */}
      <div className="shrink-0 border-t border-slate-800/90 bg-slate-900/98 backdrop-blur-xl px-4 sm:px-6 py-3.5 space-y-2.5 sticky bottom-0 z-30 shadow-[0_-10px_35px_rgba(0,0,0,0.8)]">
        {/* Scrubber Progress Bar */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-slate-400 w-12 text-right">
            {formatTime(currentTime)}
          </span>

          <div
            className="flex-1 h-2.5 bg-slate-800 hover:h-3 rounded-full relative cursor-pointer group transition-all"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              seek(pos * displayDuration);
            }}
          >
            {/* Progress Filled */}
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full relative"
              style={{
                width: `${Math.min(100, (currentTime / (displayDuration || 1)) * 100)}%`,
              }}
            >
              <div className="w-3.5 h-3.5 bg-white rounded-full absolute right-0 top-1/2 -translate-y-1/2 shadow opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>

            {/* Sentence / Chunk Markers */}
            {dynamicSentences.map((s, idx) => (
              <div
                key={idx}
                className="absolute top-0 bottom-0 w-0.5 bg-slate-700/40 pointer-events-none"
                style={{
                  left: `${(s.start / (displayDuration || 1)) * 100}%`,
                }}
              />
            ))}
          </div>

          <span className="text-xs font-mono text-slate-400 w-12">
            {formatTime(displayDuration)}
          </span>
        </div>

        {/* Playback Controls & Utility Toggles */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Left: Reading Modes */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPortuguese(!showPortuguese)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
                showPortuguese
                  ? 'bg-indigo-950/60 text-indigo-300 border-indigo-700/50'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
              title="Mostrar ou ocultar tradução em português"
            >
              <Languages className="w-3.5 h-3.5" />
              <span>{showPortuguese ? 'Legendas PT: On' : 'Legendas PT: Off'}</span>
            </button>

            <button
              onClick={() => setBlurEnglish(!blurEnglish)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
                blurEnglish
                  ? 'bg-amber-950/60 text-amber-300 border-amber-700/50'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
              title="Modo escuta: oculta o texto em inglês até você passar o mouse"
            >
              {blurEnglish ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{blurEnglish ? 'Escuta Ativa: On' : 'Modo Escuta'}</span>
            </button>
          </div>

          {/* Center: Main Playback Controls */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => jumpSentence(-1)}
              className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-full transition"
              title="Frase Anterior"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={togglePlay}
              className="w-12 h-12 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white rounded-full flex items-center justify-center shadow-lg shadow-indigo-600/30 transition"
              title={isPlaying ? 'Pausar' : 'Tocar'}
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>

            <button
              onClick={() => jumpSentence(1)}
              className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-full transition"
              title="Próxima Frase"
            >
              <RotateCw className="w-4 h-4" />
            </button>

            <button
              onClick={() => setRepeatSentenceMode(!repeatSentenceMode)}
              className={`p-2 rounded-full transition border ${
                repeatSentenceMode
                  ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500'
                  : 'text-slate-400 hover:text-white border-transparent'
              }`}
              title="Shadowing Loop: Repetir frase atual continuamente"
            >
              <Repeat className="w-4 h-4" />
            </button>
          </div>

          {/* Right: Speed Adjustment */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Gauge className="w-3.5 h-3.5" />
              Velocidade:
            </span>
            <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg p-0.5">
              {[0.75, 1.0, 1.25, 1.5].map((spd) => (
                <button
                  key={spd}
                  onClick={() => setPlaybackSpeed(spd)}
                  className={`px-2 py-0.5 text-xs rounded transition font-mono ${
                    playbackSpeed === spd
                      ? 'bg-indigo-600 text-white font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
