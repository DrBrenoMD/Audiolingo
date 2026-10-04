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
} from 'lucide-react';
import { WordLookupResult, SRSFlashcard } from '../types';
import { audioEngine } from '../utils/audioEngine';
import confetti from 'canvas-confetti';

interface WordInspectorModalProps {
  word: string;
  contextSentence?: string;
  bookTitle?: string;
  isOpen: boolean;
  onClose: () => void;
  onSaveToSRS: (card: Partial<SRSFlashcard>) => void;
  onInspectNewWord?: (newWord: string) => void;
  onPracticeSpeakingWord?: (wordText: string) => void;
}

// Client-side cache for 0ms instantaneous repeated lookups
const clientWordCache = new Map<string, WordLookupResult>();

export const WordInspectorModal: React.FC<WordInspectorModalProps> = ({
  word,
  contextSentence = '',
  bookTitle = '',
  isOpen,
  onClose,
  onSaveToSRS,
  onInspectNewWord,
  onPracticeSpeakingWord,
}) => {
  const [loading, setLoading] = useState(false);
  const [loadingAI, setLoadingAI] = useState(false);
  const [data, setData] = useState<WordLookupResult | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [playingAudio, setPlayingAudio] = useState(false);

  useEffect(() => {
    if (!isOpen || !word) return;

    let isMounted = true;
    setSavedSuccess(false);

    const clean = word.replace(/[^a-zA-Z0-9']/g, '').trim();
    const cacheKey = `${clean.toLowerCase()}_${contextSentence.slice(0, 25)}`;

    // Instant 0ms response if cached
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
        forceAI: false, // Use fast traditional API by default
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
            examples: [{ en: contextSentence || clean, pt: 'Exemplo do audiolivro.' }],
          });
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, word, contextSentence]);

  if (!isOpen) return null;

  // On-demand AI Deep Dive
  const handleDeepDiveAI = async () => {
    if (!data) return;
    setLoadingAI(true);
    try {
      const res = await fetch('/api/word-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          word: data.word,
          sentenceContext: contextSentence,
          forceAI: true,
        }),
      });
      if (res.ok) {
        const aiData: WordLookupResult = await res.json();
        setData(aiData);
        const clean = data.word.toLowerCase();
        const cacheKey = `${clean}_${contextSentence.slice(0, 25)}`;
        clientWordCache.set(cacheKey, aiData);
      }
    } catch (e) {
      console.warn('AI deep dive failed:', e);
    } finally {
      setLoadingAI(false);
    }
  };

  const handlePlayTTS = async (slow = false) => {
    setPlayingAudio(true);
    // Use human native audio URL if provided, otherwise instant Web Speech API
    await audioEngine.speakText(word, {
      audioUrl: data?.audioUrl,
      slow,
    });
    setPlayingAudio(false);
  };

  const handlePlayExampleTTS = async (text: string) => {
    await audioEngine.speakText(text);
  };

  const handleAddToDeck = () => {
    if (!data) return;
    onSaveToSRS({
      type: 'word',
      frontText: data.word,
      contextSentence: contextSentence || data.examples?.[0]?.en || '',
      backTranslation: data.contextualTranslation,
      phonetic: data.phonetic,
      notes: `${data.partOfSpeech.toUpperCase()} (${data.cefrLevel}) • ${data.contextualExplanation}`,
      audiobookTitle: bookTitle,
    });
    setSavedSuccess(true);
    confetti({
      particleCount: 35,
      spread: 60,
      origin: { y: 0.8 },
      colors: ['#6366f1', '#a855f7', '#10b981'],
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-2xl max-h-[90vh] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl shadow-indigo-950/50 flex flex-col overflow-hidden text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90 sticky top-0 z-10">
          <div className="flex items-center gap-2 font-medium text-xs">
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold">
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              <span>Dicionário Instantâneo (API Tradicional)</span>
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <div className="w-8 h-8 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin" />
              <p className="text-slate-400 text-xs animate-pulse">
                Carregando tradução e definições instantâneas...
              </p>
            </div>
          ) : data ? (
            <>
              {/* Word Title & Pronunciation Section */}
              <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-800/80">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-3xl font-extrabold tracking-tight text-white font-serif">
                      {data.word}
                    </h2>
                    <span
                      className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                        cefrColors[data.cefrLevel] || 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {data.cefrLevel || 'B1'}
                    </span>
                    <span className="text-xs uppercase tracking-wider text-slate-400 font-mono bg-slate-800/80 px-2 py-0.5 rounded">
                      {data.partOfSpeech || 'termo'}
                    </span>
                  </div>
                  <p className="text-indigo-300 font-mono text-sm mt-1">
                    {data.phonetic || '/.../'}
                  </p>
                </div>

                {/* Audio Buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePlayTTS(false)}
                    disabled={playingAudio}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white rounded-lg text-xs font-medium transition shadow-sm"
                    title={data.audioUrl ? 'Ouvir gravação humana real' : 'Ouvir pronúncia imediata'}
                  >
                    <Volume2 className="w-4 h-4" />
                    <span>{data.audioUrl ? 'Voz Humana' : 'Pronúncia'}</span>
                  </button>
                  <button
                    onClick={() => handlePlayTTS(true)}
                    disabled={playingAudio}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition"
                    title="Ouvir em velocidade reduzida (0.75x)"
                  >
                    <Volume1 className="w-4 h-4 text-amber-400" />
                    <span>0.75x</span>
                  </button>
                </div>
              </div>

              {/* Instant Translation Highlight */}
              <div className="bg-gradient-to-r from-slate-900 to-indigo-950/40 border border-indigo-800/40 rounded-xl p-4">
                <div className="text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                  Tradução em Português
                </div>
                <div className="text-2xl font-bold text-emerald-400 mb-1 capitalize">
                  {data.contextualTranslation}
                </div>
                {data.contextualExplanation && (
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {data.contextualExplanation}
                  </p>
                )}
              </div>

              {/* Definitions */}
              {data.definitions && data.definitions.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                    Significados em Inglês
                  </h4>
                  <div className="space-y-2">
                    {data.definitions.map((def, idx) => (
                      <div key={idx} className="bg-slate-800/50 rounded-lg p-3 border border-slate-800 text-sm">
                        <div className="text-slate-200 font-medium">{def.englishDef}</div>
                        {def.portugueseDef && (
                          <div className="text-slate-400 text-xs mt-0.5">{def.portugueseDef}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Example Sentences */}
              {data.examples && data.examples.length > 0 && (
                <div className="space-y-2.5">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-indigo-400" />
                    Exemplos em Frases
                  </h4>
                  <div className="space-y-2">
                    {data.examples.map((ex, idx) => (
                      <div
                        key={idx}
                        className="group flex items-start justify-between gap-3 bg-slate-800/40 hover:bg-slate-800/80 p-3 rounded-lg border border-slate-800 transition"
                      >
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium text-slate-100">{ex.en}</p>
                          {ex.pt && <p className="text-xs text-slate-400 italic">{ex.pt}</p>}
                        </div>
                        <button
                          onClick={() => handlePlayExampleTTS(ex.en)}
                          className="p-1.5 text-slate-400 hover:text-indigo-300 hover:bg-indigo-950/50 rounded transition shrink-0"
                          title="Ouvir frase"
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Synonyms & Collocations */}
              {(data.synonyms?.length > 0 || data.collocations?.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {data.synonyms && data.synonyms.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Sinônimos
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {data.synonyms.map((syn, idx) => (
                          <button
                            key={idx}
                            onClick={() => onInspectNewWord?.(syn)}
                            className="text-xs px-2.5 py-1 bg-slate-800 hover:bg-indigo-950 hover:text-indigo-300 hover:border-indigo-700/50 border border-slate-700/70 rounded-md text-slate-300 transition flex items-center gap-1"
                          >
                            <span>{syn}</span>
                            <ArrowRight className="w-2.5 h-2.5 opacity-60" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {data.collocations && data.collocations.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Combinações de Palavras (Collocations)
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {data.collocations.map((col, idx) => (
                          <span
                            key={idx}
                            className="text-xs px-2.5 py-1 bg-slate-800/70 border border-slate-700/40 rounded-md text-slate-300"
                          >
                            {col}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Optional On-Demand AI Deep Dive Banner */}
              {data.source !== 'ai' && (
                <div className="p-3 bg-slate-800/40 border border-slate-700/60 rounded-xl flex items-center justify-between gap-3">
                  <div className="text-xs text-slate-400">
                    Quer explicações gramaticais e nuances literárias avançadas?
                  </div>
                  <button
                    onClick={handleDeepDiveAI}
                    disabled={loadingAI}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-semibold transition shrink-0"
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${loadingAI ? 'animate-spin' : ''}`} />
                    <span>{loadingAI ? 'Consultando IA...' : 'Aprofundar com IA'}</span>
                  </button>
                </div>
              )}

              {/* Grammar Note if present */}
              {data.grammarNotes && (
                <div className="p-3 bg-amber-950/20 border border-amber-900/30 rounded-lg text-xs text-amber-300 leading-relaxed">
                  <span className="font-semibold">💡 Dica Gramatical: </span>
                  {data.grammarNotes}
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/90 flex flex-wrap items-center justify-between gap-3 sticky bottom-0 z-10">
          <button
            onClick={() => {
              if (data) onPracticeSpeakingWord?.(data.word);
            }}
            className="text-xs font-medium text-indigo-300 hover:text-indigo-200 hover:underline flex items-center gap-1"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Treinar Pronúncia no Speaking Lab</span>
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
            >
              Fechar
            </button>
            <button
              onClick={handleAddToDeck}
              disabled={savedSuccess || !data}
              className={`flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg transition shadow-lg ${
                savedSuccess
                  ? 'bg-emerald-600 text-white shadow-emerald-950/50'
                  : 'bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white shadow-indigo-950/50'
              }`}
            >
              {savedSuccess ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Salvo no Baralho SRS!</span>
                </>
              ) : (
                <>
                  <BookmarkPlus className="w-4 h-4" />
                  <span>Salvar no Baralho SRS</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
