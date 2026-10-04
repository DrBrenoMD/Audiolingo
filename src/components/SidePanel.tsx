import React, { useState, useEffect, useRef } from 'react';
import {
  Volume2,
  Volume1,
  BookmarkPlus,
  Sparkles,
  X,
  Check,
  ArrowRight,
  BookOpen,
  Layers,
  Lightbulb,
  Zap,
  Languages,
  CheckCircle2,
  ListOrdered,
  Mic,
  FolderUp,
  Folder,
  ArrowUp,
  ArrowDown,
  Trash2,
  HardDrive,
  Smartphone,
  Check as CheckIcon,
  User,
  Sliders,
} from 'lucide-react';
import { WordLookupResult, SRSFlashcard, Audiobook, Chapter, Sentence, GrammarExplanationResult } from '../types';
import { audioEngine, BrowserVoice } from '../utils/audioEngine';
import { liveTranscriber } from '../utils/liveTranscription';
import confetti from 'canvas-confetti';

export type SidePanelMode = 'word' | 'grammar' | 'chapters' | 'voice' | 'upload';

interface QueuedFile {
  file: File;
  id: string;
  name: string;
  cleanTitle: string;
  sizeMb: string;
  blobUrl: string;
}

interface SidePanelProps {
  mode: SidePanelMode;
  onClose: () => void;
  audiobook: Audiobook;
  currentChapterIdx: number;
  onSelectChapter: (idx: number) => void;
  // Word mode props
  word?: string | null;
  contextSentence?: string;
  sentenceTranslationPt?: string;
  onInspectNewWord?: (word: string) => void;
  onPracticeSpeakingWord?: (word: string) => void;
  // Grammar mode props
  grammarSentence?: string | null;
  // Common
  onSaveToSRS: (card: Partial<SRSFlashcard>) => void;
  onAudiobookCreated: (newBook: Audiobook) => void;
}

// Memory caches for 0ms instantaneous repeated lookups
const clientWordCache = new Map<string, WordLookupResult>();
const translationTextCache = new Map<string, string>();
const grammarCache = new Map<string, GrammarExplanationResult>();

function cleanChapterTitle(filename: string): string {
  let name = filename.replace(/\.[^/.]+$/, '');
  name = name.replace(/[_-]/g, ' ').trim();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function naturalSortFiles(files: File[]): File[] {
  return [...files].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  );
}

export const SidePanel: React.FC<SidePanelProps> = ({
  mode,
  onClose,
  audiobook,
  currentChapterIdx,
  onSelectChapter,
  word,
  contextSentence = '',
  sentenceTranslationPt = '',
  onInspectNewWord,
  onPracticeSpeakingWord,
  grammarSentence,
  onSaveToSRS,
  onAudiobookCreated,
}) => {
  // --- Word state ---
  const [wordData, setWordData] = useState<WordLookupResult | null>(null);
  const [loadingWord, setLoadingWord] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [playingAudio, setPlayingAudio] = useState(false);
  const [translatedDefinitions, setTranslatedDefinitions] = useState<Record<number, string>>({});
  const [translatedExamples, setTranslatedExamples] = useState<Record<number, string>>({});

  // --- Grammar state ---
  const [grammarData, setGrammarData] = useState<GrammarExplanationResult | null>(null);
  const [loadingGrammar, setLoadingGrammar] = useState(false);
  const [grammarSaved, setGrammarSaved] = useState(false);

  // --- Voice state ---
  const [voices, setVoices] = useState<BrowserVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('');
  const [testingVoiceURI, setTestingVoiceURI] = useState<string | null>(null);

  // --- Upload state ---
  const [uploadTab, setUploadTab] = useState<'folder' | 'files' | 'guide'>('folder');
  const [queuedFiles, setQueuedFiles] = useState<QueuedFile[]>([]);
  const [newBookTitle, setNewBookTitle] = useState('');
  const [newAuthor, setNewAuthor] = useState('');
  const [newLevel, setNewLevel] = useState<'Beginner' | 'Intermediate' | 'Advanced'>('Intermediate');
  const [referenceText, setReferenceText] = useState('');
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [currentProcIdx, setCurrentProcIdx] = useState(0);
  const [uploadError, setUploadError] = useState('');

  const folderInputRef = useRef<HTMLInputElement>(null);
  const multiFileInputRef = useRef<HTMLInputElement>(null);

  // 1. Fetch word details when in word mode
  useEffect(() => {
    if (mode !== 'word' || !word) return;

    let isMounted = true;
    setSavedSuccess(false);
    setTranslatedDefinitions({});
    setTranslatedExamples({});

    const clean = word.replace(/[^a-zA-Z0-9']/g, '').trim();
    const cacheKey = `${clean.toLowerCase()}_${contextSentence.slice(0, 25)}`;

    if (clientWordCache.has(cacheKey)) {
      setWordData(clientWordCache.get(cacheKey)!);
      setLoadingWord(false);
      return;
    }

    setLoadingWord(true);

    fetch('/api/word-lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        word: clean,
        sentenceContext: contextSentence,
        forceAI: false,
      }),
    })
      .then((r) => r.json())
      .then((res: WordLookupResult) => {
        if (isMounted) {
          setWordData(res);
          clientWordCache.set(cacheKey, res);
          setLoadingWord(false);
        }
      })
      .catch((err) => {
        console.error(err);
        if (isMounted) {
          setWordData({
            word: clean,
            phonetic: `/${clean}/`,
            partOfSpeech: 'termo',
            cefrLevel: 'B1',
            contextualTranslation: clean,
            contextualExplanation: 'Tradução no contexto.',
            definitions: [{ pos: 'termo', englishDef: clean, portugueseDef: 'Significado' }],
            synonyms: [],
            antonyms: [],
            collocations: [],
            examples: [{ en: contextSentence || clean, pt: sentenceTranslationPt || '' }],
          });
          setLoadingWord(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [mode, word, contextSentence, sentenceTranslationPt]);

  // 2. Fetch grammar details when in grammar mode
  useEffect(() => {
    if (mode !== 'grammar' || !grammarSentence) return;

    let isMounted = true;
    setGrammarSaved(false);

    if (grammarCache.has(grammarSentence)) {
      setGrammarData(grammarCache.get(grammarSentence)!);
      setLoadingGrammar(false);
      return;
    }

    setLoadingGrammar(true);

    fetch('/api/explain-grammar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sentence: grammarSentence }),
    })
      .then((r) => r.json())
      .then((res: GrammarExplanationResult) => {
        if (isMounted) {
          setGrammarData(res);
          grammarCache.set(grammarSentence, res);
          setLoadingGrammar(false);
        }
      })
      .catch((err) => {
        console.error(err);
        if (isMounted) setLoadingGrammar(false);
      });

    return () => {
      isMounted = false;
    };
  }, [mode, grammarSentence]);

  // 3. Load voices when in voice mode
  useEffect(() => {
    if (mode !== 'voice') return;
    const load = () => {
      const avail = audioEngine.getAvailableVoices();
      setVoices(avail);
      setSelectedVoiceURI(audioEngine.getSelectedVoiceURI());
    };
    load();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = load;
    }
  }, [mode]);

  // Fast translation helper for definitions and examples
  const fetchFastTranslation = async (text: string): Promise<string> => {
    if (translationTextCache.has(text)) return translationTextCache.get(text)!;
    try {
      const res = await fetch('/api/fast-translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, from: 'en', to: 'pt-BR' }),
      });
      if (res.ok) {
        const d = await res.json();
        const pt = d.translatedText || text;
        translationTextCache.set(text, pt);
        return pt;
      }
    } catch {}
    return text;
  };

  const handleTranslateAllWordDetails = async () => {
    if (!wordData) return;
    const defPromises = (wordData.definitions || []).map(async (d, i) => {
      if (!translatedDefinitions[i]) {
        const pt = await fetchFastTranslation(d.englishDef);
        return { index: i, text: pt, type: 'def' as const };
      }
      return null;
    });

    const exPromises = (wordData.examples || []).map(async (ex, i) => {
      if (!ex.pt && !translatedExamples[i]) {
        const pt = await fetchFastTranslation(ex.en);
        return { index: i, text: pt, type: 'ex' as const };
      }
      return null;
    });

    const results = await Promise.all([...defPromises, ...exPromises]);
    const newDefs = { ...translatedDefinitions };
    const newExs = { ...translatedExamples };

    for (const r of results) {
      if (r) {
        if (r.type === 'def') newDefs[r.index] = r.text;
        if (r.type === 'ex') newExs[r.index] = r.text;
      }
    }
    setTranslatedDefinitions(newDefs);
    setTranslatedExamples(newExs);
  };

  // Add FULL SENTENCE to SRS
  const handleSaveWordSentenceToSRS = () => {
    if (!wordData) return;
    const fullSentence = contextSentence || wordData.examples?.[0]?.en || wordData.word;
    const fullTranslation =
      sentenceTranslationPt ||
      translatedExamples[0] ||
      wordData.examples?.[0]?.pt ||
      `Tradução de "${wordData.word}": ${wordData.contextualTranslation}`;

    const regex = new RegExp(`\\b(${wordData.word})\\b`, 'gi');
    const highlightedFront = fullSentence.replace(regex, '【$1】');

    onSaveToSRS({
      type: 'sentence',
      frontText: highlightedFront,
      contextSentence: `Palavra em foco: ${wordData.word} (${wordData.phonetic})`,
      backTranslation: fullTranslation,
      phonetic: wordData.phonetic,
      notes: `Palavra chave: ${wordData.word.toUpperCase()} = "${wordData.contextualTranslation}" (${wordData.partOfSpeech}) • Audiolivro: ${audiobook.title}`,
      audiobookTitle: audiobook.title,
    });

    setSavedSuccess(true);
    confetti({ particleCount: 35, spread: 60, origin: { y: 0.8 }, colors: ['#6366f1', '#10b981'] });
  };

  // Upload handling
  const handleFilesSelected = (filesList: FileList | null) => {
    if (!filesList || filesList.length === 0) return;
    const valid = /\.(mp3|m4b|m4a|wav|ogg|aac|webm)$/i;
    const allFiles = Array.from(filesList).filter((f) => valid.test(f.name));

    if (allFiles.length === 0) {
      setUploadError('Nenhum arquivo de áudio suportado (.mp3, .m4b, .m4a, .wav, .ogg) encontrado.');
      return;
    }

    setUploadError('');
    const sorted = naturalSortFiles(allFiles);

    if (!newBookTitle) {
      if (sorted[0].webkitRelativePath) {
        const folderName = sorted[0].webkitRelativePath.split('/')[0];
        if (folderName) setNewBookTitle(folderName.replace(/[_-]/g, ' '));
      } else {
        const firstClean = cleanChapterTitle(sorted[0].name);
        setNewBookTitle(firstClean.replace(/\b(chapter|capitulo|track|faixa)\b.*$/i, '').trim() || firstClean);
      }
    }

    const queued: QueuedFile[] = sorted.map((file, idx) => ({
      file,
      id: `file-${Date.now()}-${idx}`,
      name: file.name,
      cleanTitle: cleanChapterTitle(file.name),
      sizeMb: (file.size / (1024 * 1024)).toFixed(1),
      blobUrl: URL.createObjectURL(file),
    }));

    setQueuedFiles(queued);
  };

  const handleProcessUpload = async () => {
    if (queuedFiles.length === 0) {
      setUploadError('Selecione arquivos de áudio ou pasta primeiro.');
      return;
    }

    setIsProcessingUpload(true);
    setUploadError('');

    try {
      const generatedChapters: Chapter[] = [];
      const total = queuedFiles.length;

      for (let i = 0; i < total; i++) {
        setCurrentProcIdx(i);
        const item = queuedFiles[i];
        setUploadProgress(`Transcrevendo e alinhando faixa ${i + 1}/${total}: "${item.cleanTitle}"...`);

        // Probe real hardware duration of the audio file in the browser (100% exact, no AI needed)
        const realDuration = await new Promise<number>((resolve) => {
          const probe = new Audio(item.blobUrl);
          probe.onloadedmetadata = () => {
            const dur = probe.duration;
            resolve(isFinite(dur) && dur > 0 ? Math.round(dur) : 180);
          };
          probe.onerror = () => resolve(180);
        });

        let chapterSentences: Sentence[] = [];
        let summaryPt = `Capítulo ${i + 1} importado com sucesso.`;

        // If user provided reference text, subtitle, or script, parse and align INSTANTLY without AI
        if (referenceText && i === 0) {
          chapterSentences = liveTranscriber.parseTextToTimedSentences(referenceText, realDuration);
        }

        // If no reference text, create agile progressive timeframes across the REAL duration
        if (chapterSentences.length === 0) {
          chapterSentences = liveTranscriber.generateInitialTimeframes(realDuration, item.cleanTitle);
        }

        generatedChapters.push({
          id: `ch-${Date.now()}-${i}`,
          chapterNumber: i + 1,
          title: item.cleanTitle,
          fileName: item.name,
          audioUrl: item.blobUrl,
          duration: realDuration,
          summaryPt,
          sentences: chapterSentences,
          status: 'ready',
        });
      }

      const finalTitle = newBookTitle.trim() || 'Audiolivro Importado';
      const firstChapter = generatedChapters[0];

      const newAudiobook: Audiobook = {
        id: `custom-${Date.now()}`,
        title: finalTitle,
        author: newAuthor.trim() || 'Coleção de Áudios',
        coverUrl:
          'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=600&auto=format&fit=crop&q=80',
        audioUrl: firstChapter.audioUrl,
        duration: generatedChapters.reduce((acc, c) => acc + c.duration, 0),
        description: `Audiolivro completo com ${generatedChapters.length} faixa(s) importada(s).`,
        level: newLevel,
        category: 'Imported',
        chapters: generatedChapters,
        currentChapterIndex: 0,
        sentences: firstChapter.sentences,
        summaryPt: firstChapter.summaryPt,
      };

      onAudiobookCreated(newAudiobook);
      onClose();
    } catch (e: any) {
      setUploadError(e.message || 'Falha ao processar arquivos.');
    } finally {
      setIsProcessingUpload(false);
    }
  };

  const cefrColors: Record<string, string> = {
    A1: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    A2: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
    B1: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    B2: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    C1: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    C2: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  };

  return (
    <aside
      className="w-full md:w-[400px] lg:w-[440px] bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col h-full shrink-0 z-30 animate-in slide-in-from-right duration-200 text-slate-100"
      aria-label="Painel Lateral"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-900/95 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          {mode === 'word' && (
            <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold">
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              <span>Dicionário & Tradução</span>
            </span>
          )}
          {mode === 'grammar' && (
            <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Análise Gramatical</span>
            </span>
          )}
          {mode === 'chapters' && (
            <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-bold">
              <ListOrdered className="w-3.5 h-3.5 text-purple-400" />
              <span>Índice de Capítulos ({audiobook.chapters?.length || 1})</span>
            </span>
          )}
          {mode === 'voice' && (
            <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30 text-xs font-bold">
              <Volume2 className="w-3.5 h-3.5 text-teal-400" />
              <span>Vozes do Navegador</span>
            </span>
          )}
          {mode === 'upload' && (
            <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-bold">
              <FolderUp className="w-3.5 h-3.5 text-indigo-400" />
              <span>Importar Áudio / Pasta</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {mode === 'word' && (
            <button
              onClick={handleTranslateAllWordDetails}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-xs rounded-lg border border-slate-700 text-slate-200 transition flex items-center gap-1"
              title="Traduzir todas as definições e exemplos para Português"
            >
              <Languages className="w-3 h-3 text-indigo-400" />
              <span>Traduzir Tudo</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            title="Fechar barra lateral"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
        {/* ================= MODE: WORD ================= */}
        {mode === 'word' && (
          <>
            {loadingWord ? (
              <div className="flex flex-col items-center justify-center py-16 space-y-3">
                <div className="w-8 h-8 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin" />
                <p className="text-slate-400 text-xs animate-pulse">Carregando tradução instantânea...</p>
              </div>
            ) : wordData ? (
              <div className="space-y-5">
                {/* Word Title & Pronunciation */}
                <div className="pb-3 border-b border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <h3 className="text-2xl font-black text-white font-serif tracking-tight">
                        {wordData.word}
                      </h3>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${cefrColors[wordData.cefrLevel] || 'bg-slate-800'}`}>
                        {wordData.cefrLevel}
                      </span>
                      <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                        {wordData.partOfSpeech}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={async () => {
                          setPlayingAudio(true);
                          await audioEngine.speakText(wordData.word, { audioUrl: wordData.audioUrl });
                          setPlayingAudio(false);
                        }}
                        disabled={playingAudio}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white rounded-lg text-xs font-semibold transition"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>{wordData.audioUrl ? 'Voz Humana' : 'Pronúncia'}</span>
                      </button>

                      <button
                        onClick={async () => {
                          setPlayingAudio(true);
                          await audioEngine.speakText(wordData.word, { slow: true });
                          setPlayingAudio(false);
                        }}
                        disabled={playingAudio}
                        className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-semibold transition"
                      >
                        <Volume1 className="w-3.5 h-3.5 text-amber-400" />
                        <span>0.75x</span>
                      </button>
                    </div>
                  </div>

                  <div className="text-indigo-300 font-mono text-xs">{wordData.phonetic}</div>
                </div>

                {/* Translation Highlight */}
                <div className="bg-gradient-to-r from-slate-900 to-indigo-950/40 border border-indigo-800/40 rounded-xl p-3.5 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1">
                    <Lightbulb className="w-3 h-3 text-amber-400" />
                    Tradução em Português
                  </span>
                  <div className="text-xl font-extrabold text-emerald-400 capitalize">
                    {wordData.contextualTranslation}
                  </div>
                  {wordData.contextualExplanation && (
                    <p className="text-xs text-slate-300 leading-relaxed">{wordData.contextualExplanation}</p>
                  )}
                </div>

                {/* Definitions */}
                {wordData.definitions && wordData.definitions.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-bold uppercase text-slate-400 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                      Significados em Inglês
                    </span>
                    <div className="space-y-2">
                      {wordData.definitions.map((def, idx) => (
                        <div key={idx} className="p-3 bg-slate-800/50 rounded-xl border border-slate-700/60 text-xs space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-slate-200 font-medium leading-relaxed">{def.englishDef}</p>
                            <button
                              onClick={async () => {
                                if (translatedDefinitions[idx]) return;
                                const pt = await fetchFastTranslation(def.englishDef);
                                setTranslatedDefinitions((prev) => ({ ...prev, [idx]: pt }));
                              }}
                              className="shrink-0 p-1 text-slate-400 hover:text-indigo-300 rounded transition"
                              title="Traduzir significado para Português"
                            >
                              <Languages className="w-3.5 h-3.5 text-indigo-400" />
                            </button>
                          </div>
                          {translatedDefinitions[idx] && (
                            <div className="pt-1 border-t border-slate-700/50 text-emerald-400 text-xs italic font-sans flex items-start gap-1">
                              <span className="text-[9px] uppercase font-bold text-slate-500 not-italic">PT:</span>
                              <span>{translatedDefinitions[idx]}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Examples */}
                {wordData.examples && wordData.examples.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-bold uppercase text-slate-400 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-indigo-400" />
                      Frases de Exemplo
                    </span>
                    <div className="space-y-2">
                      {wordData.examples.map((ex, idx) => {
                        const pt = translatedExamples[idx] || ex.pt;
                        return (
                          <div key={idx} className="p-3 bg-slate-800/40 rounded-xl border border-slate-700/60 text-xs space-y-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-slate-100 font-serif leading-relaxed">"{ex.en}"</p>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => audioEngine.speakText(ex.en)}
                                  className="p-1 text-slate-400 hover:text-white"
                                  title="Ouvir exemplo"
                                >
                                  <Volume2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={async () => {
                                    if (translatedExamples[idx]) return;
                                    const t = await fetchFastTranslation(ex.en);
                                    setTranslatedExamples((prev) => ({ ...prev, [idx]: t }));
                                  }}
                                  className="p-1 text-slate-400 hover:text-indigo-300"
                                  title="Traduzir exemplo para Português"
                                >
                                  <Languages className="w-3.5 h-3.5 text-indigo-400" />
                                </button>
                              </div>
                            </div>
                            {pt && (
                              <div className="pt-1 border-t border-slate-700/40 text-slate-400 italic text-[11px]">
                                "{pt}"
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Synonyms */}
                {wordData.synonyms && wordData.synonyms.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold uppercase text-slate-400">Sinônimos</span>
                    <div className="flex flex-wrap gap-1">
                      {wordData.synonyms.map((syn, idx) => (
                        <button
                          key={idx}
                          onClick={() => onInspectNewWord?.(syn)}
                          className="text-[11px] px-2 py-0.5 bg-slate-800 hover:bg-indigo-950 hover:text-indigo-300 border border-slate-700/70 rounded text-slate-300 transition flex items-center gap-1"
                        >
                          <span>{syn}</span>
                          <ArrowRight className="w-2.5 h-2.5 opacity-50" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </>
        )}

        {/* ================= MODE: GRAMMAR ================= */}
        {mode === 'grammar' && (
          <div className="space-y-5">
            <div className="p-3.5 bg-slate-800/60 rounded-xl border border-slate-700/60 space-y-2">
              <span className="text-[10px] uppercase font-bold text-indigo-400">Frase em Análise</span>
              <p className="text-sm font-semibold text-white font-serif leading-relaxed">"{grammarSentence}"</p>
            </div>

            {loadingGrammar ? (
              <div className="py-12 text-center space-y-2">
                <div className="w-8 h-8 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin mx-auto" />
                <p className="text-slate-400 text-xs animate-pulse">Dissecando tempos verbais e orações...</p>
              </div>
            ) : grammarData ? (
              <div className="space-y-4">
                {grammarData.translationPt && (
                  <div className="p-3 bg-emerald-950/30 border border-emerald-800/40 rounded-xl">
                    <span className="text-[10px] uppercase font-bold text-emerald-400">Tradução Natural</span>
                    <p className="text-xs text-emerald-200 italic mt-0.5">"{grammarData.translationPt}"</p>
                  </div>
                )}

                {grammarData.mainTense && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 font-semibold uppercase">Tempo Principal:</span>
                    <span className="text-xs font-bold px-2 py-0.5 bg-indigo-950 text-indigo-300 border border-indigo-800 rounded">
                      {grammarData.mainTense}
                    </span>
                  </div>
                )}

                {grammarData.structures?.map((st, i) => (
                  <div key={i} className="p-3 bg-slate-800/50 rounded-xl border border-slate-700/60 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-indigo-300">{st.name}</span>
                      <span className="bg-slate-800 px-2 py-0.5 rounded text-amber-300 font-mono text-[11px]">
                        {st.element}
                      </span>
                    </div>
                    <p className="text-slate-300 leading-relaxed">{st.explanationPt}</p>
                    {st.alternativeExamples?.length > 0 && (
                      <div className="mt-1.5 pt-1.5 border-t border-slate-700/50 space-y-1">
                        <span className="text-[10px] text-slate-400 font-semibold">Exemplos similares:</span>
                        {st.alternativeExamples.map((ex, j) => (
                          <p key={j} className="text-slate-300 pl-2 border-l-2 border-indigo-500/40">
                            {ex}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}

        {/* ================= MODE: CHAPTERS ================= */}
        {mode === 'chapters' && (
          <div className="space-y-4">
            <p className="text-xs text-slate-400">
              Clique em qualquer faixa ou capítulo para tocar imediatamente:
            </p>
            <div className="space-y-2">
              {(audiobook.chapters && audiobook.chapters.length > 0
                ? audiobook.chapters
                : [{ id: 'ch-0', title: audiobook.title, duration: audiobook.duration, chapterNumber: 1 }]
              ).map((ch: any, idx: number) => (
                <button
                  key={ch.id || idx}
                  onClick={() => onSelectChapter(idx)}
                  className={`w-full text-left p-3 rounded-xl border transition flex items-center justify-between gap-3 ${
                    currentChapterIdx === idx
                      ? 'bg-indigo-600/20 border-indigo-500/80 text-white'
                      : 'bg-slate-800/40 hover:bg-slate-800 border-slate-700/60 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <span
                      className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono text-xs font-bold shrink-0 ${
                        currentChapterIdx === idx ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <div className="overflow-hidden">
                      <div className="font-semibold text-xs truncate">{ch.title}</div>
                      {ch.fileName && (
                        <div className="text-[10px] text-slate-400 truncate font-mono">{ch.fileName}</div>
                      )}
                    </div>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400 shrink-0">
                    {Math.floor(ch.duration / 60)}:{(ch.duration % 60).toString().padStart(2, '0')}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ================= MODE: VOICE ================= */}
        {mode === 'voice' && (
          <div className="space-y-4">
            <p className="text-xs text-slate-400">
              Vozes com selo <strong className="text-emerald-400">Natural</strong> têm entonação ultra-realista no Windows/Edge/Chrome:
            </p>
            <div className="space-y-2">
              {voices.map((v) => {
                const isSelected = selectedVoiceURI === v.voiceURI;
                const isTesting = testingVoiceURI === v.voiceURI;
                return (
                  <div
                    key={v.voiceURI}
                    onClick={() => {
                      setSelectedVoiceURI(v.voiceURI);
                      audioEngine.setSelectedVoice(v.voiceURI);
                    }}
                    className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between gap-2.5 ${
                      isSelected
                        ? 'bg-indigo-600/20 border-indigo-500 text-white'
                        : 'bg-slate-800/40 hover:bg-slate-800 border-slate-700/60 text-slate-300'
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-xs truncate">{v.name}</span>
                        {v.isNatural && (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Natural
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">{v.lang}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          setTestingVoiceURI(v.voiceURI);
                          await audioEngine.speakText('This is a test of natural voice playback.', {
                            voiceURI: v.voiceURI,
                          });
                          setTestingVoiceURI(null);
                        }}
                        className="px-2 py-1 bg-slate-800 hover:bg-indigo-950 border border-slate-700 rounded text-[11px] font-medium transition"
                      >
                        {isTesting ? 'Ouvindo...' : 'Testar'}
                      </button>
                      {isSelected && <CheckIcon className="w-4 h-4 text-indigo-400" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================= MODE: UPLOAD ================= */}
        {mode === 'upload' && (
          <div className="space-y-4">
            <div className="flex items-center gap-1 p-1 bg-slate-800 rounded-xl border border-slate-700 text-xs">
              <button
                onClick={() => setUploadTab('folder')}
                className={`flex-1 py-1.5 rounded-lg font-semibold transition ${
                  uploadTab === 'folder' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Pasta Inteira
              </button>
              <button
                onClick={() => setUploadTab('files')}
                className={`flex-1 py-1.5 rounded-lg font-semibold transition ${
                  uploadTab === 'files' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Arquivos MP3
              </button>
              <button
                onClick={() => setUploadTab('guide')}
                className={`flex-1 py-1.5 rounded-lg font-semibold transition ${
                  uploadTab === 'guide' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Android/Drive
              </button>
            </div>

            {uploadError && (
              <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-xl text-xs text-rose-300">
                {uploadError}
              </div>
            )}

            {uploadTab === 'guide' ? (
              <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700/60 text-xs space-y-2 text-slate-300">
                <span className="font-bold text-white">Importar pelo celular ou Drive:</span>
                <p>
                  1. Clique em "Arquivos MP3" e o seletor do Android abrirá seu Google Drive ou armazenamento interno.
                </p>
                <p>2. Selecione múltiplos capítulos de uma vez para criar o audiolivro completo na hora.</p>
              </div>
            ) : (
              <>
                <input
                  ref={folderInputRef}
                  type="file"
                  // @ts-ignore
                  webkitdirectory="true"
                  directory="true"
                  multiple
                  onChange={(e) => handleFilesSelected(e.target.files)}
                  className="hidden"
                />
                <input
                  ref={multiFileInputRef}
                  type="file"
                  multiple
                  accept="audio/*,.mp3,.m4b,.m4a,.wav,.ogg"
                  onChange={(e) => handleFilesSelected(e.target.files)}
                  className="hidden"
                />

                <div
                  onClick={() => {
                    if (uploadTab === 'folder') folderInputRef.current?.click();
                    else multiFileInputRef.current?.click();
                  }}
                  className="border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-2xl p-6 text-center cursor-pointer transition hover:bg-slate-800/40 space-y-2"
                >
                  <FolderUp className="w-8 h-8 text-indigo-400 mx-auto" />
                  <p className="text-xs font-bold text-white">
                    {uploadTab === 'folder' ? 'Selecionar pasta do audiolivro' : 'Selecionar arquivos MP3/M4B'}
                  </p>
                  <p className="text-[11px] text-slate-400">Suporta múltiplos capítulos ordenados numericamente.</p>
                </div>

                {queuedFiles.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-slate-400">
                      {queuedFiles.length} faixa(s) pronta(s):
                    </span>
                    <div className="max-h-40 overflow-y-auto space-y-1.5 custom-scrollbar p-1">
                      {queuedFiles.map((f, i) => (
                        <div
                          key={f.id}
                          className="flex items-center justify-between p-2 bg-slate-800/60 rounded-lg text-xs"
                        >
                          <span className="truncate">{i + 1}. {f.cleanTitle}</span>
                          <span className="text-[10px] text-slate-400 font-mono shrink-0">{f.sizeMb}MB</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2 pt-2">
                  <label className="text-xs text-slate-300 font-semibold">Título</label>
                  <input
                    type="text"
                    value={newBookTitle}
                    onChange={(e) => setNewBookTitle(e.target.value)}
                    placeholder="Nome da Obra"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
                  />
                </div>

                <div className="space-y-1.5 pt-1">
                  <label className="text-xs text-slate-300 font-semibold flex items-center justify-between">
                    <span>Texto do Livro ou Legenda SRT (Opcional)</span>
                    <span className="text-[10px] text-emerald-400 font-normal">Alinhamento 0ms sem IA</span>
                  </label>
                  <textarea
                    value={referenceText}
                    onChange={(e) => setReferenceText(e.target.value)}
                    placeholder="Cole aqui o texto em inglês ou legenda .SRT para alinhamento instantâneo sem IA..."
                    rows={3}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {isProcessingUpload && (
                  <div className="p-3 bg-indigo-950/40 border border-indigo-800/50 rounded-xl space-y-2">
                    <div className="flex items-center gap-2 text-xs text-indigo-300">
                      <Sparkles className="w-3.5 h-3.5 animate-spin" />
                      <span>{uploadProgress}</span>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-indigo-500 h-full transition-all"
                        style={{ width: `${((currentProcIdx + 1) / queuedFiles.length) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-slate-800 bg-slate-900/95 sticky bottom-0 z-10">
        {mode === 'word' && (
          <button
            onClick={handleSaveWordSentenceToSRS}
            disabled={savedSuccess || !wordData}
            className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-bold rounded-xl transition shadow-lg ${
              savedSuccess
                ? 'bg-emerald-600 text-white shadow-emerald-950/50'
                : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 active:scale-95 text-white shadow-indigo-950/50'
            }`}
          >
            {savedSuccess ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Frase Completa Salva no SRS!</span>
              </>
            ) : (
              <>
                <BookmarkPlus className="w-4 h-4" />
                <span>Salvar Frase Completa no SRS</span>
              </>
            )}
          </button>
        )}

        {mode === 'grammar' && (
          <button
            onClick={() => {
              if (!grammarSentence) return;
              onSaveToSRS({
                type: 'sentence',
                frontText: grammarSentence,
                backTranslation: grammarData?.translationPt || 'Tradução do audiolivro',
                notes: `Estrutura: ${grammarData?.mainTense || 'Gramática'} • Audiolivro: ${audiobook.title}`,
                audiobookTitle: audiobook.title,
              });
              setGrammarSaved(true);
              confetti({ particleCount: 30, spread: 50, origin: { y: 0.8 } });
            }}
            disabled={grammarSaved}
            className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-bold rounded-xl transition ${
              grammarSaved ? 'bg-emerald-600 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'
            }`}
          >
            {grammarSaved ? <CheckCircle2 className="w-4 h-4" /> : <BookmarkPlus className="w-4 h-4" />}
            <span>{grammarSaved ? 'Frase Salva no SRS!' : 'Salvar Frase no SRS'}</span>
          </button>
        )}

        {mode === 'upload' && queuedFiles.length > 0 && (
          <button
            onClick={handleProcessUpload}
            disabled={isProcessingUpload}
            className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition shadow-lg"
          >
            {isProcessingUpload ? 'Sincronizando...' : `Importar ${queuedFiles.length} Capítulos`}
          </button>
        )}
      </div>
    </aside>
  );
};
