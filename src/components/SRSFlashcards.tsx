import React, { useState } from 'react';
import {
  RotateCcw,
  Volume2,
  Sparkles,
  CheckCircle2,
  Layers,
  Calendar,
  Award,
  Trash2,
  BookOpen,
  Filter,
} from 'lucide-react';
import { SRSFlashcard } from '../types';
import { calculateNextSRS } from '../utils/srs';
import { audioEngine } from '../utils/audioEngine';
import confetti from 'canvas-confetti';

interface SRSFlashcardsProps {
  cards: SRSFlashcard[];
  onUpdateCard: (updatedCard: SRSFlashcard) => void;
  onDeleteCard: (id: string) => void;
}

export const SRSFlashcards: React.FC<SRSFlashcardsProps> = ({
  cards,
  onUpdateCard,
  onDeleteCard,
}) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [filterType, setFilterType] = useState<'all' | 'sentence' | 'word'>('all');

  const now = Date.now();
  const filteredCards = cards.filter((c) => {
    if (filterType === 'all') return true;
    return c.type === filterType;
  });

  const dueCards = filteredCards.filter((c) => c.dueDate <= now);
  const reviewDeck = dueCards.length > 0 ? dueCards : filteredCards;
  const currentCard = reviewDeck[currentIndex];

  const handleRate = (rating: number) => {
    if (!currentCard) return;

    const next = calculateNextSRS(currentCard, rating);
    const updated: SRSFlashcard = {
      ...currentCard,
      ...next,
      history: [
        ...currentCard.history,
        {
          reviewedAt: Date.now(),
          rating,
          interval: next.interval,
        },
      ],
    };

    onUpdateCard(updated);
    setIsFlipped(false);

    if (currentIndex < reviewDeck.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      setCurrentIndex(0);
      confetti({
        particleCount: 60,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#6366f1', '#10b981', '#f59e0b', '#ec4899'],
      });
    }
  };

  const handlePlayAudio = () => {
    if (!currentCard) return;
    // Strip target brackets for clean pronunciation
    const cleanText = currentCard.frontText.replace(/【|】/g, '');
    audioEngine.speakText(cleanText);
  };

  const masteredCount = cards.filter((c) => c.state === 'mastered').length;
  const learningCount = cards.filter((c) => c.state === 'learning' || c.state === 'new').length;
  const reviewCount = cards.filter((c) => c.state === 'review').length;

  // Render front text with target word highlighted
  const renderFrontText = (text: string) => {
    if (!text.includes('【')) {
      return <span>{text}</span>;
    }
    const parts = text.split(/(【[^】]+】)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('【') && part.endsWith('】')) {
        const clean = part.slice(1, -1);
        return (
          <span
            key={idx}
            className="text-amber-300 bg-amber-950/60 border border-amber-600/40 px-1.5 py-0.5 rounded font-bold underline decoration-amber-400"
          >
            {clean}
          </span>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-8 text-slate-100">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <Layers className="w-6 h-6 text-indigo-400" />
            <span>Sistema de Repetição Espaçada (SRS - Frases em Contexto)</span>
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Memorização acelerada baseada no aprendizado de frases completas (*Sentence Mining*), sem palavras isoladas fora de contexto.
          </p>
        </div>

        {/* Deck Filters */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs">
            <button
              onClick={() => {
                setFilterType('all');
                setCurrentIndex(0);
                setIsFlipped(false);
              }}
              className={`px-3 py-1.5 rounded-md transition font-medium ${
                filterType === 'all' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Todas as Frases ({cards.length})
            </button>
            <button
              onClick={() => {
                setFilterType('sentence');
                setCurrentIndex(0);
                setIsFlipped(false);
              }}
              className={`px-3 py-1.5 rounded-md transition font-medium ${
                filterType === 'sentence' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Frases do Audiolivro ({cards.filter((c) => c.type === 'sentence').length})
            </button>
          </div>
        </div>
      </div>

      {/* Stats Counter Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl">
          <span className="text-xs text-slate-400 uppercase font-semibold">Para Revisar Hoje</span>
          <div className="text-2xl font-black text-amber-400 mt-1">{dueCards.length}</div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl">
          <span className="text-xs text-slate-400 uppercase font-semibold">Aprendendo</span>
          <div className="text-2xl font-black text-indigo-400 mt-1">{learningCount}</div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl">
          <span className="text-xs text-slate-400 uppercase font-semibold">Em Revisão</span>
          <div className="text-2xl font-black text-purple-400 mt-1">{reviewCount}</div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl">
          <span className="text-xs text-slate-400 uppercase font-semibold">Dominados</span>
          <div className="text-2xl font-black text-emerald-400 mt-1">{masteredCount}</div>
        </div>
      </div>

      {/* Flashcard Area */}
      {currentCard ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>
              Frase {currentIndex + 1} de {reviewDeck.length}{' '}
              {dueCards.length > 0 ? '(Revisões Pendentes)' : '(Modo Prática Livre)'}
            </span>
            <div className="flex items-center gap-3">
              <span className="uppercase font-mono bg-slate-800 px-2 py-0.5 rounded text-[11px] text-indigo-300">
                Intervalo Atual: {currentCard.interval} {currentCard.interval === 1 ? 'dia' : 'dias'}
              </span>
              <button
                onClick={() => onDeleteCard(currentCard.id)}
                className="text-slate-500 hover:text-rose-400 transition"
                title="Excluir este cartão"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Interactive Flip Card */}
          <div
            onClick={() => setIsFlipped(!isFlipped)}
            className={`min-h-[300px] p-8 rounded-3xl border cursor-pointer transition-all duration-300 flex flex-col justify-between shadow-2xl relative select-none ${
              isFlipped
                ? 'bg-gradient-to-br from-indigo-950/60 via-slate-900 to-purple-950/40 border-indigo-500/50 shadow-indigo-950/40'
                : 'bg-slate-900 hover:bg-slate-900/90 border-slate-700/80 hover:border-indigo-500/40'
            }`}
          >
            {/* Top Card Meta */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-800 text-indigo-300 uppercase tracking-wider">
                Frase Completa
              </span>
              <span className="text-xs text-slate-400">
                {currentCard.audiobookTitle}
              </span>
            </div>

            {/* Front & Back Content */}
            <div className="py-6 text-center space-y-4">
              {!isFlipped ? (
                // FRONT: Full Sentence
                <div className="space-y-3">
                  <h3
                    className={`font-serif text-white tracking-wide leading-relaxed ${
                      currentCard.frontText.length > 100
                        ? 'text-lg sm:text-xl text-left sm:text-center'
                        : 'text-2xl sm:text-3xl'
                    }`}
                  >
                    {renderFrontText(currentCard.frontText)}
                  </h3>
                  {currentCard.contextSentence && (
                    <p className="text-xs text-slate-400 max-w-lg mx-auto font-mono">
                      {currentCard.contextSentence}
                    </p>
                  )}
                </div>
              ) : (
                // BACK: Full Portuguese Translation & Notes
                <div className="space-y-3 animate-in fade-in zoom-in-95 duration-200">
                  <div
                    className={`font-medium text-emerald-400 leading-relaxed ${
                      currentCard.backTranslation.length > 100
                        ? 'text-base sm:text-lg text-left sm:text-center'
                        : 'text-xl sm:text-2xl'
                    }`}
                  >
                    "{currentCard.backTranslation}"
                  </div>
                  {currentCard.notes && (
                    <p className="text-xs text-slate-300 max-w-lg mx-auto leading-relaxed pt-2 border-t border-slate-800/80">
                      {currentCard.notes}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Bottom Card Controls */}
            <div className="flex items-center justify-between text-xs text-slate-400">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handlePlayAudio();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-200 transition"
              >
                <Volume2 className="w-4 h-4 text-indigo-400" />
                <span>Ouvir com Voz do Navegador</span>
              </button>

              <span className="text-slate-500">
                {isFlipped ? 'Clique para virar' : 'Clique para ver tradução'}
              </span>
            </div>
          </div>

          {/* Rating Response Buttons (SM-2 Quality Options) */}
          {isFlipped && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-in fade-in duration-200">
              <button
                onClick={() => handleRate(1)}
                className="flex flex-col items-center justify-center p-3.5 bg-rose-950/40 hover:bg-rose-950/80 active:scale-95 border border-rose-800/60 rounded-xl transition text-rose-300"
              >
                <span className="font-bold text-sm">Errei (Again)</span>
                <span className="text-[11px] text-rose-400/80 mt-0.5">Rever em 1 dia</span>
              </button>

              <button
                onClick={() => handleRate(2)}
                className="flex flex-col items-center justify-center p-3.5 bg-amber-950/40 hover:bg-amber-950/80 active:scale-95 border border-amber-800/60 rounded-xl transition text-amber-300"
              >
                <span className="font-bold text-sm">Difícil (Hard)</span>
                <span className="text-[11px] text-amber-400/80 mt-0.5">Rever em 3 dias</span>
              </button>

              <button
                onClick={() => handleRate(3)}
                className="flex flex-col items-center justify-center p-3.5 bg-indigo-950/40 hover:bg-indigo-950/80 active:scale-95 border border-indigo-800/60 rounded-xl transition text-indigo-300"
              >
                <span className="font-bold text-sm">Bom (Good)</span>
                <span className="text-[11px] text-indigo-400/80 mt-0.5">Rever em 6 dias</span>
              </button>

              <button
                onClick={() => handleRate(4)}
                className="flex flex-col items-center justify-center p-3.5 bg-emerald-950/40 hover:bg-emerald-950/80 active:scale-95 border border-emerald-800/60 rounded-xl transition text-emerald-300"
              >
                <span className="font-bold text-sm">Fácil (Easy)</span>
                <span className="text-[11px] text-emerald-400/80 mt-0.5">Rever em 10+ dias</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="py-20 text-center space-y-4 bg-slate-900/40 rounded-2xl border border-slate-800">
          <Award className="w-12 h-12 text-emerald-400 mx-auto" />
          <h3 className="text-xl font-bold text-white">Parabéns! Todas as frases revisadas!</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            Você não possui frases pendentes para hoje. Salve novas frases inteiras enquanto escuta os audiolivros!
          </p>
        </div>
      )}
    </div>
  );
};
