import React, { useState } from 'react';
import {
  PenTool,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  ArrowRight,
  BookOpen,
  Award,
} from 'lucide-react';
import { Audiobook, WritingEvaluationResult } from '../types';
import confetti from 'canvas-confetti';

interface WritingLabProps {
  currentAudiobook: Audiobook;
  onRecordWriting?: () => void;
}

export const WritingLab: React.FC<WritingLabProps> = ({ currentAudiobook, onRecordWriting }) => {
  const [promptTopic, setPromptTopic] = useState<'summary' | 'reflection' | 'creative'>('summary');
  const [text, setText] = useState('');
  const [evaluating, setEvaluating] = useState(false);
  const [result, setResult] = useState<WritingEvaluationResult | null>(null);

  const prompts = {
    summary: `Escreva um resumo em inglês (3 a 5 frases) sobre os pontos principais que você ouviu em "${currentAudiobook.title}".`,
    reflection: `Qual é a sua opinião sobre as ideias transmitidas pelo autor em "${currentAudiobook.title}"? Dê exemplos da sua própria vida.`,
    creative: `Imagine uma conversa entre você e o narrador/personagem principal de "${currentAudiobook.title}". Escreva o diálogo em inglês.`,
  };

  // Recommended vocabulary extracted from the book
  const suggestedVocabulary = currentAudiobook.sentences
    .flatMap((s) => s.words)
    .filter((w) => w.cleanWord.length > 5)
    .slice(0, 8)
    .map((w) => w.cleanWord);

  const handleEvaluate = async () => {
    if (!text.trim()) return;

    setEvaluating(true);
    setResult(null);

    try {
      const res = await fetch('/api/writing-evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentText: text,
          promptContext: `${prompts[promptTopic]} (Livro: ${currentAudiobook.title})`,
          targetLevel: currentAudiobook.level === 'Beginner' ? 'B1' : 'B2',
        }),
      });

      if (res.ok) {
        const data: WritingEvaluationResult = await res.json();
        setResult(data);
        onRecordWriting?.();
        if (data.score >= 80) {
          confetti({
            particleCount: 45,
            spread: 60,
            origin: { y: 0.8 },
          });
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setEvaluating(false);
    }
  };

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-8 text-slate-100">
      {/* Header */}
      <div className="border-b border-slate-800 pb-6">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2.5">
          <PenTool className="w-6 h-6 text-purple-400" />
          <span>Laboratório de Escrita & Paráfrase com IA</span>
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Pratique redação e fixação de vocabulário com correções gramaticais minuciosas e sugestões de elevação de vocabulário (A2 → B2 → C1).
        </p>
      </div>

      {/* Prompt Card */}
      <div className="bg-slate-900/80 border border-slate-700/80 rounded-2xl p-6 space-y-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Escolha seu Desafio de Redação
          </span>
          <div className="flex items-center gap-1.5 bg-slate-800 p-1 rounded-lg border border-slate-700">
            <button
              onClick={() => setPromptTopic('summary')}
              className={`px-3 py-1 rounded text-xs font-semibold transition ${
                promptTopic === 'summary' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Resumo
            </button>
            <button
              onClick={() => setPromptTopic('reflection')}
              className={`px-3 py-1 rounded text-xs font-semibold transition ${
                promptTopic === 'reflection' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Reflexão Pessoal
            </button>
            <button
              onClick={() => setPromptTopic('creative')}
              className={`px-3 py-1 rounded text-xs font-semibold transition ${
                promptTopic === 'creative' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Criativo / Diálogo
            </button>
          </div>
        </div>

        <div className="p-4 bg-indigo-950/30 border border-indigo-800/40 rounded-xl text-indigo-200 text-sm font-medium leading-relaxed">
          {prompts[promptTopic]}
        </div>

        {/* Vocabulary Bank */}
        <div className="space-y-1.5">
          <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Vocabulário sugerido deste audiolivro (tente incluir em seu texto):
          </span>
          <div className="flex flex-wrap gap-1.5">
            {suggestedVocabulary.map((v, i) => (
              <span
                key={i}
                className="text-xs px-2.5 py-1 bg-slate-800 border border-slate-700/60 rounded-md text-slate-300 font-mono"
              >
                {v}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Editor Station */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Seu texto em inglês:</span>
          <span>{wordCount} palavras</span>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder="Start typing your thoughts in English here... You can use the vocabulary suggestions above to enrich your writing."
          className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-5 text-white text-base focus:outline-none focus:border-indigo-500 transition resize-none font-serif leading-relaxed shadow-xl"
        />

        <div className="flex justify-end">
          <button
            onClick={handleEvaluate}
            disabled={evaluating || wordCount < 5}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition shadow-lg shadow-purple-950/50"
          >
            {evaluating ? (
              <>
                <Sparkles className="w-4 h-4 animate-spin" />
                <span>Avaliando Gramática e Vocabulário com IA...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Avaliar Redação com IA</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* AI Evaluation Results */}
      {result && (
        <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl animate-in fade-in duration-300">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-400" />
                <span>Feedback do Avaliador IA</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">{result.summaryFeedbackPt}</p>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-xs text-slate-400 uppercase font-semibold">Nível CEFR</div>
                <span className="text-lg font-bold px-3 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {result.estimatedCefrLevel}
                </span>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400 uppercase font-semibold">Nota</div>
                <span
                  className={`text-2xl font-black ${
                    result.score >= 80
                      ? 'text-emerald-400'
                      : result.score >= 60
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }`}
                >
                  {result.score}%
                </span>
              </div>
            </div>
          </div>

          {/* Grammar & Word Corrections */}
          {result.corrections && result.corrections.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                Correções Gramaticais & Ortográficas ({result.corrections.length})
              </h4>
              <div className="space-y-2.5">
                {result.corrections.map((corr, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 bg-rose-950/20 border border-rose-900/30 rounded-xl space-y-1.5"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="line-through text-rose-400 bg-rose-950/40 px-2 py-0.5 rounded">
                        {corr.original}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                      <span className="font-semibold text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded">
                        {corr.corrected}
                      </span>
                      <span className="text-[10px] uppercase font-mono px-2 py-0.5 bg-slate-800 text-slate-400 rounded">
                        {corr.type}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300">{corr.explanationPt}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Vocabulary Upgrades */}
          {result.vocabularyUpgrades && result.vocabularyUpgrades.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                <Lightbulb className="w-4 h-4" />
                Elevação de Vocabulário (Upgrades de Nível)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {result.vocabularyUpgrades.map((up, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-indigo-950/20 border border-indigo-900/30 rounded-xl space-y-1"
                  >
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-400">{up.original}</span>
                      <ArrowRight className="w-3 h-3 text-indigo-400" />
                      <span className="font-bold text-indigo-300">{up.suggested}</span>
                    </div>
                    <p className="text-[11px] text-slate-400">{up.reasonPt}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Polished Native Version */}
          {result.nativeVersion && (
            <div className="p-4 bg-gradient-to-r from-slate-950 to-indigo-950/40 border border-indigo-800/40 rounded-xl space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                Como um Falante Nativo Escreveria (Versão C1/C2 Polida)
              </span>
              <p className="text-sm font-serif text-slate-200 leading-relaxed italic">
                "{result.nativeVersion}"
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
