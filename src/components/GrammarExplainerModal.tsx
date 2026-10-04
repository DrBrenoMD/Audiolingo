import React, { useState, useEffect } from 'react';
import { Sparkles, X, BookOpen, Layers, CheckCircle2, BookmarkPlus, Volume2 } from 'lucide-react';
import { GrammarExplanationResult, SRSFlashcard } from '../types';
import { audioEngine } from '../utils/audioEngine';
import confetti from 'canvas-confetti';

interface GrammarExplainerModalProps {
  sentence: string;
  isOpen: boolean;
  onClose: () => void;
  onSaveToSRS: (card: Partial<SRSFlashcard>) => void;
  bookTitle?: string;
}

export const GrammarExplainerModal: React.FC<GrammarExplainerModalProps> = ({
  sentence,
  isOpen,
  onClose,
  onSaveToSRS,
  bookTitle = '',
}) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<GrammarExplanationResult | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!isOpen || !sentence) return;
    let isMounted = true;
    setLoading(true);
    setSaved(false);

    fetch('/api/explain-grammar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sentence }),
    })
      .then((r) => r.json())
      .then((res: GrammarExplanationResult) => {
        if (isMounted) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((e) => {
        console.error(e);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, sentence]);

  if (!isOpen) return null;

  const handleSavePhrase = () => {
    if (!sentence) return;
    onSaveToSRS({
      type: 'sentence',
      frontText: sentence,
      backTranslation: data?.translationPt || 'Tradução do audiolivro',
      notes: `Tempo verbal: ${data?.mainTense || 'Inglês Contextual'} • ${data?.culturalOrIdiomaticNuance || ''}`,
      audiobookTitle: bookTitle,
    });
    setSaved(true);
    confetti({
      particleCount: 30,
      spread: 50,
      origin: { y: 0.8 },
      colors: ['#a855f7', '#6366f1'],
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
      <div
        className="w-full max-w-2xl max-h-[90vh] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90 sticky top-0 z-10">
          <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm">
            <Sparkles className="w-4 h-4" />
            <span>Análise Gramatical & Estrutural da Frase</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Target Sentence Box */}
          <div className="p-4 bg-slate-800/60 rounded-xl border border-slate-700/60 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <p className="text-base font-semibold text-white font-serif leading-relaxed">
                "{sentence}"
              </p>
              <button
                onClick={() => audioEngine.speakText(sentence)}
                className="p-1.5 text-slate-300 hover:text-indigo-400 hover:bg-slate-700 rounded transition shrink-0"
                title="Ouvir frase"
              >
                <Volume2 className="w-4 h-4" />
              </button>
            </div>
            {data?.translationPt && (
              <p className="text-sm text-emerald-400 italic pt-1 border-t border-slate-700/50">
                "{data.translationPt}"
              </p>
            )}
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <div className="w-8 h-8 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin" />
              <p className="text-slate-400 text-xs animate-pulse">
                Identificando tempos verbais, orações e expressões idiomáticas...
              </p>
            </div>
          ) : data ? (
            <>
              {/* Tense Badge */}
              {data.mainTense && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase text-slate-400">Tempo / Estrutura Principal:</span>
                  <span className="text-xs font-bold px-2.5 py-1 bg-indigo-950/80 text-indigo-300 border border-indigo-700/50 rounded-md">
                    {data.mainTense}
                  </span>
                </div>
              )}

              {/* Structures */}
              {data.structures?.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-indigo-400" />
                    Padrões e Regras Aplicadas
                  </h4>
                  <div className="space-y-3">
                    {data.structures.map((st, i) => (
                      <div key={i} className="bg-slate-800/40 p-3.5 rounded-xl border border-slate-700/60 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm text-indigo-300">{st.name}</span>
                          <span className="text-xs bg-slate-800 px-2 py-0.5 rounded text-amber-300 font-mono">
                            {st.element}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">{st.explanationPt}</p>
                        {st.alternativeExamples?.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-slate-700/40 space-y-1">
                            <span className="text-[11px] text-slate-400 font-medium">Outros exemplos similares:</span>
                            {st.alternativeExamples.map((ex, j) => (
                              <p key={j} className="text-xs text-slate-200 pl-2 border-l-2 border-indigo-500/40">
                                {ex}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cultural/Idiomatic Nuance */}
              {data.culturalOrIdiomaticNuance && (
                <div className="p-3.5 bg-purple-950/30 border border-purple-800/40 rounded-xl text-xs text-purple-200 leading-relaxed space-y-1">
                  <span className="font-bold text-purple-300">🎭 Nuance Cultural & Registro: </span>
                  <p>{data.culturalOrIdiomaticNuance}</p>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between gap-3 sticky bottom-0 z-10">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
          >
            Fechar
          </button>
          <button
            onClick={handleSavePhrase}
            disabled={saved}
            className={`flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg transition shadow-lg ${
              saved
                ? 'bg-emerald-600 text-white'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-950/50 active:scale-95'
            }`}
          >
            {saved ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Frase Salva no SRS!</span>
              </>
            ) : (
              <>
                <BookmarkPlus className="w-4 h-4" />
                <span>Salvar Frase no SRS</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
