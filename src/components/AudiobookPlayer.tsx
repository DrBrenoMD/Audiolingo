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
  Sliders,
} from 'lucide-react';
import { Audiobook, Sentence, WordCue, SRSFlashcard, Chapter } from '../types';
import { audioEngine } from '../utils/audioEngine';
import { SidePanel, SidePanelMode } from './SidePanel';
import confetti from 'canvas-confetti';

interface AudiobookPlayerProps {
  audiobook: Audiobook;
  onSaveToSRS: (card: Partial<SRSFlashcard>) => void;
  onNavigateToSpeaking: (sentenceText: string) => void;
  onSelectAudiobook: (book: Audiobook) => void;
  allAudiobooks: Audiobook[];
  onAudiobookCreated: (newBook: Audiobook) => void;
}

export const AudiobookPlayer: React.FC<AudiobookPlayerProps> = ({
  audiobook,
  onSaveToSRS,
  onNavigateToSpeaking,
  onSelectAudiobook,
  allAudiobooks,
  onAudiobookCreated,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [showPortuguese, setShowPortuguese] = useState<boolean>(true);
  const [blurEnglish, setBlurEnglish] = useState<boolean>(false);
  const [repeatSentenceMode, setRepeatSentenceMode] = useState<boolean>(false);
  const [savedSentenceId, setSavedSentenceId] = useState<string | null>(null);

  // Multi-chapter state
  const [currentChapterIdx, setCurrentChapterIdx] = useState<number>(
    audiobook.currentChapterIndex || 0
  );

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

  // Reset when audiobook changes
  useEffect(() => {
    setCurrentChapterIdx(audiobook.currentChapterIndex || 0);
    setCurrentTime(0);
    setIsPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [audiobook.id]);

  const currentChapter: Chapter | undefined = audiobook.chapters?.[currentChapterIdx];
  const activeSentences: Sentence[] = currentChapter?.sentences || audiobook.sentences || [];
  const activeDuration: number = currentChapter?.duration || audiobook.duration || 60;
  const activeAudioSrc: string = currentChapter?.audioUrl || audiobook.audioUrl || '';

  // Synchronize playback speed with audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Active sentence & word
  const activeSentenceIndex = activeSentences.findIndex(
    (s) => currentTime >= s.start && currentTime <= s.end
  );
  const activeSentence =
    activeSentenceIndex !== -1 ? activeSentences[activeSentenceIndex] : null;

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

  // Audio timer fallback when no hardware audio is playing
  useEffect(() => {
    if (isPlaying && !activeAudioSrc) {
      const intervalMs = 50;
      playTimerRef.current = window.setInterval(() => {
        setCurrentTime((prev) => {
          const nextTime = prev + (intervalMs / 1000) * playbackSpeed;
          if (repeatSentenceMode && activeSentence && nextTime >= activeSentence.end) {
            return activeSentence.start;
          }
          if (nextTime >= activeDuration) {
            if (audiobook.chapters && currentChapterIdx < audiobook.chapters.length - 1) {
              switchChapter(currentChapterIdx + 1);
              return 0;
            } else {
              setIsPlaying(false);
              return 0;
            }
          }
          return nextTime;
        });
      }, intervalMs);
    } else {
      if (playTimerRef.current) {
        clearInterval(playTimerRef.current);
        playTimerRef.current = null;
      }
    }
    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, [isPlaying, activeAudioSrc, playbackSpeed, repeatSentenceMode, activeSentence?.id, activeDuration, currentChapterIdx]);

  // Play / Pause toggle controlling actual audio element
  const togglePlay = () => {
    if (!isPlaying) {
      if (audioRef.current && activeAudioSrc) {
        if (currentTime >= activeDuration) {
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
    const clamped = Math.max(0, Math.min(time, activeDuration));
    setCurrentTime(clamped);
    if (audioRef.current && isFinite(clamped)) {
      audioRef.current.currentTime = clamped;
    }
  };

  const jumpSentence = (delta: number) => {
    let nextIdx = activeSentenceIndex + delta;
    if (nextIdx < 0) nextIdx = 0;
    if (nextIdx >= activeSentences.length) nextIdx = activeSentences.length - 1;
    const target = activeSentences[nextIdx];
    if (target) {
      seek(target.start);
    }
  };

  const switchChapter = (index: number) => {
    if (index >= 0 && audiobook.chapters && index < audiobook.chapters.length) {
      setCurrentChapterIdx(index);
      setCurrentTime(0);
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

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 relative">
      {/* Real Hardware HTML5 Audio Element for direct playback of MP3 / M4B */}
      {activeAudioSrc && (
        <audio
          ref={audioRef}
          src={activeAudioSrc}
          preload="auto"
          onTimeUpdate={() => {
            if (audioRef.current) {
              const cur = audioRef.current.currentTime;
              setCurrentTime(cur);
              // Handle sentence loop
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

        {/* Audiobook & Side Tools Triggers (all open in side panel!) */}
        <div className="flex items-center gap-2 flex-wrap">
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

          {/* Voice Selector button (opens in sidebar!) */}
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

          {/* Upload Button (opens in sidebar!) */}
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
          className="flex-1 overflow-y-auto px-6 py-8 space-y-6 max-w-4xl mx-auto w-full custom-scrollbar"
        >
          {/* Prompt Banner */}
          <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80 text-xs text-slate-400 flex items-start justify-between gap-4">
            <div className="flex items-start gap-2">
              <HelpCircle className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-slate-300">Barra Lateral Integrada: </span>
                Todas as ferramentas (Dicionário, Gramática, Capítulos, Vozes e Upload) abrem na barra lateral à direita, <strong className="text-emerald-400">sem tampar o texto do audiolivro</strong>.
              </div>
            </div>
          </div>

          {/* Sentences List */}
          <div className="space-y-6">
            {activeSentences.map((sentence, sIdx) => {
              const isCurrentSentence = activeSentenceIndex === sIdx;

              return (
                <div
                  key={sentence.id}
                  className={`group relative p-4 rounded-2xl transition-all duration-300 border ${
                    isCurrentSentence
                      ? 'bg-slate-900/90 border-indigo-500/50 shadow-xl shadow-indigo-950/20'
                      : 'bg-slate-900/20 border-slate-800/40 hover:bg-slate-900/50 hover:border-slate-800'
                  }`}
                >
                  {/* Sentence Header Actions */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => seek(sentence.start)}
                        className={`text-[11px] font-mono px-2 py-0.5 rounded transition ${
                          isCurrentSentence
                            ? 'bg-indigo-600 text-white font-semibold'
                            : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                        title="Pular áudio para esta frase"
                      >
                        {formatTime(sentence.start)}
                      </button>
                      {isCurrentSentence && (
                        <span className="flex h-2 w-2 relative">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition">
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
                    {sentence.words.map((cue, wIdx) => {
                      const isWordActive =
                        currentTime >= cue.start && currentTime <= cue.end;
                      const isWordSelected = selectedWord === cue.cleanWord;

                      return (
                        <span
                          key={wIdx}
                          ref={isWordActive ? activeWordRef : null}
                          onClick={() => handleWordClick(cue, sentence)}
                          className={`inline-block px-1 py-0.5 rounded cursor-pointer transition-all duration-150 mr-1 select-text ${
                            isWordActive
                              ? 'bg-indigo-500 text-white font-semibold scale-105 shadow-md shadow-indigo-500/40 ring-2 ring-indigo-400/50'
                              : isWordSelected
                              ? 'bg-emerald-500/30 text-emerald-200 border-b-2 border-emerald-400'
                              : 'hover:bg-indigo-950/60 hover:text-indigo-200 text-slate-200'
                          }`}
                          title="Clique para abrir detalhes na barra lateral sem tampar o texto"
                        >
                          {cue.word}
                        </span>
                      );
                    })}
                  </p>

                  {/* Subtitle / Portuguese Translation */}
                  {showPortuguese && (
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

      {/* Floating Bottom Control Bar */}
      <div className="border-t border-slate-800 bg-slate-900/95 backdrop-blur-md px-6 py-4 space-y-3 sticky bottom-0 z-20 shadow-2xl">
        {/* Scrubber Progress Bar */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-slate-400 w-10 text-right">
            {formatTime(currentTime)}
          </span>

          <div
            className="flex-1 h-2 bg-slate-800 hover:h-2.5 rounded-full relative cursor-pointer group transition-all"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pos = (e.clientX - rect.left) / rect.width;
              seek(pos * activeDuration);
            }}
          >
            {/* Progress Filled */}
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full relative"
              style={{
                width: `${(currentTime / (activeDuration || 1)) * 100}%`,
              }}
            >
              <div className="w-3.5 h-3.5 bg-white rounded-full absolute right-0 top-1/2 -translate-y-1/2 shadow opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>

            {/* Sentence Markers */}
            {activeSentences.map((s, idx) => (
              <div
                key={idx}
                className="absolute top-0 bottom-0 w-0.5 bg-slate-700/60 pointer-events-none"
                style={{
                  left: `${(s.start / (activeDuration || 1)) * 100}%`,
                }}
              />
            ))}
          </div>

          <span className="text-xs font-mono text-slate-400 w-10">
            {formatTime(activeDuration)}
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
