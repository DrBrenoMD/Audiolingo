import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { WordLookupResult, SRSFlashcard } from '../types';
import { audioEngine } from '../utils/audioEngine';
import confetti from 'canvas-confetti';

interface WordInspectorSidebarProps {
  word: string;
  contextSentence?: string;
  sentenceTranslationPt?: string;
  bookTitle?: string;
  isOpen: boolean;
  onClose: () => void;
  onSaveToSRS: (card: Partial<SRSFlashcard>) => void;
  onInspectNewWord?: (newWord: string) => void;
  onPracticeSpeakingWord?: (wordText: string) => void;
}

// Client-side instant memory cache for 0ms lookups
const clientWordCache = new Map<string, WordLookupResult>();
const translationTextCache = new Map<string, string>();

export const WordInspectorSidebar: React.FC<WordInspectorSidebarProps> = ({
  word,
  contextSentence = '',
  sentenceTranslationPt = '',
  bookTitle = '',
  isOpen,
  onClose,
  onSaveToSRS,
  onInspectNewWord,
  onPracticeSpeakingWord,
}) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<WordLookupResult | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [playingAudio, setPlayingAudio] = useState(false);

  // Translation toggles for definitions & examples
  const [translatedDefinitions, setTranslatedDefinitions] = useState<Record<number, string>>({});
  const [translatingDefIdx, setTranslatingDefIdx] = useState<number | null>(null);
  const [translatedExamples, setTranslatedExamples] = useState<Record<number, string>>({});
  const [translatingExIdx, setTranslatingExIdx] = useState<number | null>(null);
  const [translateAllActive, setTranslateAllActive] = useState(false);

  useEffect(() => {
    if (!isOpen || !word) return;

    let isMounted = true;
    setSavedSuccess(false);
    setTranslatedDefinitions({});
    setTranslatedExamples({});
    setTranslateAllActive(false);

    const clean = word.replace(/[^a-zA-Z0-9']/g, '').trim();
    const cacheKey = `${clean.toLowerCase()}_${contextSentence.slice(0, 25)}`;

    // Instant 0ms response from client memory cache
    if (clientWordCache.has(cacheKey)) {
      setData(clientWordCache.get(cacheKey)!);
      setLoading(false);
      return;
    }

    setLoading(true);

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
          setData(res);
          clientWordCache.set(cacheKey, res);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Word lookup error:', err);
        if (isMounted) {
          setData({
            word: clean,
            phonetic: `/${clean}/`,
            partOfSpeech: 'termo',
            cefrLevel: 'B1',
            contextualTranslation: clean,
            contextualExplanation: 'Tradução do termo no contexto.',
            definitions: [{ pos: 'termo', englishDef: clean, portugueseDef: 'Significado' }],
            synonyms: [],
            antonyms: [],
            collocations: [],
            examples: [{ en: contextSentence || clean, pt: sentenceTranslationPt || 'Exemplo do audiolivro.' }],
          });
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, word, contextSentence, sentenceTranslationPt]);

  if (!isOpen) return null;

  // Fast translation helper for any text
  const fetchFastTranslation = async (textToTranslate: string): Promise<string> => {
    if (translationTextCache.has(textToTranslate)) {
      return translationTextCache.get(textToTranslate)!;
    }
    try {
      const res = await fetch('/api/fast-translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToTranslate, from: 'en', to: 'pt-BR' }),
      });
      if (res.ok) {
        const data = await res.json();
        const pt = data.translatedText || textToTranslate;
        translationTextCache.set(textToTranslate, pt);
        return pt;
      }
    } catch (e) {
      console.warn('Translation error', e);
    }
    return textToTranslate;
  };

  // Translate single definition
  const handleTranslateDefinition = async (idx: number, defText: string) => {
    if (translatedDefinitions[idx]) return;
    setTranslatingDefIdx(idx);
    const pt = await fetchFastTranslation(defText);
    setTranslatedDefinitions((prev) => ({ ...prev, [idx]: pt }));
    setTranslatingDefIdx(null);
  };

  // Translate single example
  const handleTranslateExample = async (idx: number, exText: string) => {
    if (translatedExamples[idx]) return;
    setTranslatingExIdx(idx);
    const pt = await fetchFastTranslation(exText);
    setTranslatedExamples((prev) => ({ ...prev, [idx]: pt }));
    setTranslatingExIdx(null);
  };

  // Translate All Definitions & Examples at once
  const handleTranslateAll = async () => {
    if (!data) return;
    setTranslateAllActive(true);

    // Parallel fetch
    const defPromises = (data.definitions || []).map(async (d, i) => {
      if (!translatedDefinitions[i]) {
        const pt = await fetchFastTranslation(d.englishDef);
        return { index: i, text: pt, type: 'def' as const };
      }
      return null;
    });

    const exPromises = (data.examples || []).map(async (ex, i) => {
      if (!ex.pt && !translatedExamples[i]) {
        const pt = await fetchFastTranslation(ex.en);
        return { index: i, text: pt, type: 'ex' as const };
      }
      return null;
    });

    const results = await Promise.all([...defPromises, ...exPromises]);
    const newDefs: Record<number, string> = { ...translatedDefinitions };
    const newExs: Record<number, string> = { ...translatedExamples };

    for (const r of results) {
      if (r) {
        if (r.type === 'def') newDefs[r.index] = r.text;
        if (r.type === 'ex') newExs[r.index] = r.text;
      }
    }

    setTranslatedDefinitions(newDefs);
    setTranslatedExamples(newExs);
  };

  const handlePlayTTS = async (slow = false) => {
    setPlayingAudio(true);
    await audioEngine.speakText(word, {
      audioUrl: data?.audioUrl,
      slow,
    });
    setPlayingAudio(false);
  };

  const handlePlayExampleTTS = async (text: string) => {
    await audioEngine.speakText(text);
  };

  // CRITICAL REQUIREMENT: Add the ENTIRE SENTENCE to SRS instead of isolated word!
  const handleAddToDeck = () => {
    if (!data) return;

    // Use full context sentence if available, otherwise first example sentence
    const fullSentence = contextSentence || data.examples?.[0]?.en || data.word;
    const fullTranslation =
      sentenceTranslationPt ||
      translatedExamples[0] ||
      data.examples?.[0]?.pt ||
      `Tradução de "${data.word}": ${data.contextualTranslation}`;

    // Highlight target word in context sentence (e.g., "[word]")
    const regex = new RegExp(`\\b(${data.word})\\b`, 'gi');
    const highlightedFront = fullSentence.replace(regex, '【$1】');

    onSaveToSRS({
      type: 'sentence', // Full sentence for superior language retention
      frontText: highlightedFront,
      contextSentence: `Palavra em foco: ${data.word} (${data.phonetic})`,
      backTranslation: fullTranslation,
      phonetic: data.phonetic,
      notes: `Palavra chave: ${data.word.toUpperCase()} = "${data.contextualTranslation}" (${data.partOfSpeech}) • Audiolivro: ${bookTitle}`,
      audiobookTitle: bookTitle,
    });

    setSavedSuccess(true);
    confetti({
      particleCount: 40,
      spread: 60,
      origin: { y: 0.8 },
      colors: ['#6366f1', '#10b981', '#f59e0b'],
    });
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
      className="w-full md:w-96 lg:w-[420px] bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col h-full shrink-0 z-30 animate-in slide-in-from-right duration-200 text-slate-100"
      aria-label="Painel Lateral de Tradução e Dicionário"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-900/95 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold">
            <Zap className="w-3 h-3 text-emerald-400" />
            <span>Tradução Lateral Instantânea</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleTranslateAll}
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg border border-slate-700 transition"
            title="Traduzir todas as definições e exemplos para Português"
          >
            <Languages className="w-3.5 h-3.5 text-indigo-400" />
            <span>Traduzir Tudo</span>
          </button>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            title="Fechar painel lateral"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 space-y-3">
            <div className="w-8 h-8 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin" />
            <p className="text-slate-400 text-xs animate-pulse">
              Carregando significados e pronúncia instantânea...
            </p>
          </div>
        ) : data ? (
          <>
            {/* Word Header */}
            <div className="space-y-2 pb-3 border-b border-slate-800/80">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <h3 className="text-2xl font-black text-white font-serif tracking-tight">
                    {data.word}
                  </h3>
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                      cefrColors[data.cefrLevel] || 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {data.cefrLevel}
                  </span>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                    {data.partOfSpeech}
                  </span>
                </div>

                {/* Pronunciation Buttons */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handlePlayTTS(false)}
                    disabled={playingAudio}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white rounded-lg text-xs font-semibold transition"
                    title={data.audioUrl ? 'Ouvir pronúncia humana' : 'Ouvir pronúncia'}
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>{data.audioUrl ? 'Voz Humana' : 'Ouvir'}</span>
                  </button>

                  <button
                    onClick={() => handlePlayTTS(true)}
                    disabled={playingAudio}
                    className="flex items-center gap-1 px-2 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 border border-slate-700 rounded-lg text-xs font-semibold transition"
                    title="Ouvir em 0.75x"
                  >
                    <Volume1 className="w-3.5 h-3.5 text-amber-400" />
                    <span>0.75x</span>
                  </button>
                </div>
              </div>

              <div className="text-indigo-300 font-mono text-xs">
                {data.phonetic}
              </div>
            </div>

            {/* Translation Box */}
            <div className="bg-gradient-to-r from-slate-900 to-indigo-950/40 border border-indigo-800/40 rounded-xl p-3.5 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1">
                <Lightbulb className="w-3 h-3 text-amber-400" />
                Tradução em Português
              </span>
              <div className="text-xl font-extrabold text-emerald-400 capitalize">
                {data.contextualTranslation}
              </div>
              {data.contextualExplanation && (
                <p className="text-xs text-slate-300 leading-relaxed">
                  {data.contextualExplanation}
                </p>
              )}
            </div>

            {/* Definitions with On-demand Portuguese Translation */}
            {data.definitions && data.definitions.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold uppercase text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                    Definições em Inglês
                  </span>
                </div>

                <div className="space-y-2">
                  {data.definitions.map((def, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-800/50 rounded-xl border border-slate-700/60 text-xs space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-slate-200 font-medium leading-relaxed">
                          {def.englishDef}
                        </p>
                        <button
                          onClick={() => handleTranslateDefinition(idx, def.englishDef)}
                          className="shrink-0 p-1 text-slate-400 hover:text-indigo-300 hover:bg-slate-700 rounded transition"
                          title="Traduzir significado para Português"
                        >
                          <Languages className="w-3.5 h-3.5 text-indigo-400" />
                        </button>
                      </div>

                      {/* Translated Definition in PT */}
                      {translatedDefinitions[idx] && (
                        <div className="pt-1 border-t border-slate-700/50 text-emerald-400 text-xs italic font-sans flex items-start gap-1">
                          <span className="text-[9px] uppercase font-bold text-slate-500 not-italic">
                            PT:
                          </span>
                          <span>{translatedDefinitions[idx]}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Example Sentences with On-demand Portuguese Translation */}
            {data.examples && data.examples.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase text-slate-400 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-400" />
                  Frases de Exemplo
                </span>

                <div className="space-y-2">
                  {data.examples.map((ex, idx) => {
                    const translatedPt = translatedExamples[idx] || ex.pt;

                    return (
                      <div
                        key={idx}
                        className="p-3 bg-slate-800/40 rounded-xl border border-slate-700/60 text-xs space-y-1"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-slate-100 font-serif leading-relaxed">
                            "{ex.en}"
                          </p>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => handlePlayExampleTTS(ex.en)}
                              className="p-1 text-slate-400 hover:text-white"
                              title="Ouvir exemplo"
                            >
                              <Volume2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleTranslateExample(idx, ex.en)}
                              className="p-1 text-slate-400 hover:text-indigo-300"
                              title="Traduzir exemplo para Português"
                            >
                              <Languages className="w-3.5 h-3.5 text-indigo-400" />
                            </button>
                          </div>
                        </div>

                        {translatedPt && (
                          <div className="pt-1 border-t border-slate-700/40 text-slate-400 italic text-[11px]">
                            "{translatedPt}"
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Synonyms & Collocations */}
            {(data.synonyms?.length > 0 || data.collocations?.length > 0) && (
              <div className="space-y-3 pt-1">
                {data.synonyms?.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold uppercase text-slate-400">
                      Sinônimos
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {data.synonyms.map((syn, idx) => (
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

                {data.collocations?.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold uppercase text-slate-400">
                      Collocations
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {data.collocations.map((col, idx) => (
                        <span
                          key={idx}
                          className="text-[11px] px-2 py-0.5 bg-slate-800/80 border border-slate-700/50 rounded text-slate-300"
                        >
                          {col}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        ) : null}
      </div>

      {/* Footer: Add ENTIRE SENTENCE to SRS */}
      <div className="p-4 border-t border-slate-800 bg-slate-900/95 space-y-2 sticky bottom-0 z-10">
        <button
          onClick={handleAddToDeck}
          disabled={savedSuccess || !data}
          className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-bold rounded-xl transition shadow-lg ${
            savedSuccess
              ? 'bg-emerald-600 text-white shadow-emerald-950/50'
              : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 active:scale-95 text-white shadow-indigo-950/50'
          }`}
        >
          {savedSuccess ? (
            <>
              <CheckCircle2 className="w-4 h-4" />
              <span>Frase Completa Salva no Baralho SRS!</span>
            </>
          ) : (
            <>
              <BookmarkPlus className="w-4 h-4" />
              <span>Salvar Frase Completa no SRS</span>
            </>
          )}
        </button>

        <p className="text-[10px] text-center text-slate-500 leading-tight">
          Adiciona a frase inteira contextualizada ao invés de palavra isolada, garantindo memorização natural.
        </p>
      </div>
    </aside>
  );
};
