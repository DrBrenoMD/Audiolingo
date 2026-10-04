import React, { useState, useEffect } from 'react';
import {
  Headphones,
  Play,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Sparkles,
  HelpCircle,
  Volume2,
  Volume1,
  Award,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { Audiobook, ListeningChallenge } from '../types';
import { audioEngine } from '../utils/audioEngine';
import confetti from 'canvas-confetti';

interface ListeningLabProps {
  currentAudiobook: Audiobook;
}

export const ListeningLab: React.FC<ListeningLabProps> = ({ currentAudiobook }) => {
  const [activeTab, setActiveTab] = useState<'dictation' | 'quiz' | 'speed'>('dictation');
  const [challenges, setChallenges] = useState<ListeningChallenge[]>([]);
  const [loadingChallenges, setLoadingChallenges] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);

  // Dictation State
  const [dictationInput, setDictationInput] = useState('');
  const [dictationSubmitted, setDictationSubmitted] = useState(false);
  const [dictationIsCorrect, setDictationIsCorrect] = useState(false);

  // Quiz State
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [score, setScore] = useState(0);

  // Speed challenge state
  const [speedLevel, setSpeedLevel] = useState<number>(0.8);

  const fetchChallenges = () => {
    setLoadingChallenges(true);
    setDictationSubmitted(false);
    setDictationInput('');
    setQuizSubmitted(false);
    setSelectedOption(null);

    const chapterText = currentAudiobook.sentences.map((s) => s.text).join(' ');

    fetch('/api/listening-quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chapterText,
        level: currentAudiobook.level,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.challenges && data.challenges.length > 0) {
          setChallenges(data.challenges);
          setCurrentIdx(0);
        }
        setLoadingChallenges(false);
      })
      .catch((err) => {
        console.error(err);
        // Fallback default challenges if offline or error
        setChallenges([
          {
            id: 'c1',
            type: 'dictation',
            targetSentence: currentAudiobook.sentences[0]?.text || 'In my younger and more vulnerable years',
            question: 'Ouça o áudio com atenção e complete as palavras que faltam:',
            maskedSentence: currentAudiobook.sentences[0]?.text
              ? currentAudiobook.sentences[0].text.replace(/\b\w{4,}\b/g, '[____]')
              : 'In my younger and [____] years',
            correctAnswer: currentAudiobook.sentences[0]?.text || '',
            explanationPt: 'Excelente exercício para fixar reduções e conexões sonoras (connected speech).',
          },
          {
            id: 'c2',
            type: 'comprehension',
            targetSentence: currentAudiobook.sentences[1]?.text || 'Whenever you feel like criticizing anyone',
            question: 'Qual é a principal lição transmitida na passagem ouvida?',
            options: [
              'Devemos julgar todos pelos mesmos padrões de vida.',
              'Nem todas as pessoas tiveram as mesmas oportunidades e vantagens.',
              'Conselhos de família não devem ser levados a sério.',
              'O sucesso depende apenas da persistência.',
            ],
            correctAnswer: 'Nem todas as pessoas tiveram as mesmas oportunidades e vantagens.',
            explanationPt: 'O pai aconselha o filho a lembrar que nem todos desfrutaram dos mesmos privilégios.',
          },
        ]);
        setLoadingChallenges(false);
      });
  };

  useEffect(() => {
    fetchChallenges();
  }, [currentAudiobook.id]);

  const currentChallenge = challenges[currentIdx];

  const handlePlayChallengeAudio = (slow = false) => {
    if (!currentChallenge) return;
    audioEngine.speakText(currentChallenge.targetSentence, {
      slow: slow || speedLevel < 1.0,
      rate: activeTab === 'speed' ? speedLevel : slow ? 0.75 : 1.0,
    });
  };

  // Submit Dictation
  const handleCheckDictation = () => {
    if (!currentChallenge || !dictationInput.trim()) return;

    // Normalize for comparison
    const cleanUser = dictationInput.trim().toLowerCase().replace(/[^a-z0-9\s]/g, '');
    const cleanTarget = currentChallenge.correctAnswer.trim().toLowerCase().replace(/[^a-z0-9\s]/g, '');

    const isMatch = cleanUser === cleanTarget || cleanTarget.includes(cleanUser);
    setDictationIsCorrect(isMatch);
    setDictationSubmitted(true);

    if (isMatch) {
      setScore((s) => s + 1);
      confetti({
        particleCount: 40,
        spread: 60,
        origin: { y: 0.8 },
      });
    }
  };

  // Submit MCQ
  const handleSelectOption = (opt: string) => {
    if (quizSubmitted) return;
    setSelectedOption(opt);
    setQuizSubmitted(true);
    if (opt === currentChallenge?.correctAnswer) {
      setScore((s) => s + 1);
      confetti({
        particleCount: 30,
        spread: 50,
      });
    }
  };

  const handleNextChallenge = () => {
    if (currentIdx < challenges.length - 1) {
      setCurrentIdx((i) => i + 1);
      setDictationInput('');
      setDictationSubmitted(false);
      setSelectedOption(null);
      setQuizSubmitted(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-8 text-slate-100">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <Headphones className="w-6 h-6 text-indigo-400" />
            <span>Laboratório de Listening Mastery com IA</span>
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Treine seu ouvido com ditados interativos, compreensão de nuances e desafios de velocidade.
          </p>
        </div>

        <button
          onClick={fetchChallenges}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-lg border border-slate-700 transition"
        >
          <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
          <span>Gerar Novos Desafios com IA</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 p-1 bg-slate-900 border border-slate-800 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('dictation')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
            activeTab === 'dictation'
              ? 'bg-indigo-600 text-white shadow'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          1. Ditado Interativo
        </button>
        <button
          onClick={() => setActiveTab('quiz')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
            activeTab === 'quiz'
              ? 'bg-indigo-600 text-white shadow'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          2. Quiz de Compreensão
        </button>
        <button
          onClick={() => setActiveTab('speed')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
            activeTab === 'speed'
              ? 'bg-indigo-600 text-white shadow'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          3. Desafio de Velocidade
        </button>
      </div>

      {loadingChallenges ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-4">
          <div className="w-10 h-10 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
          <p className="text-sm text-slate-400 animate-pulse">
            Criando desafios auditivos inteligentes a partir do audiolivro...
          </p>
        </div>
      ) : currentChallenge ? (
        <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl">
          {/* Audio Player Box */}
          <div className="bg-gradient-to-r from-slate-950 to-slate-900 border border-slate-800 p-6 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1 text-center sm:text-left">
              <span className="text-xs uppercase font-mono text-indigo-400 tracking-wider">
                Áudio do Exercício
              </span>
              <h4 className="text-base font-semibold text-white">
                Ouça o trecho e resolva o exercício abaixo
              </h4>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => handlePlayChallengeAudio(false)}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-semibold rounded-xl text-sm transition shadow-lg shadow-indigo-950/50"
              >
                <Volume2 className="w-5 h-5" />
                <span>Ouvir Áudio</span>
              </button>
              <button
                onClick={() => handlePlayChallengeAudio(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition"
              >
                <Volume1 className="w-4 h-4 text-amber-400" />
                <span>0.75x Lento</span>
              </button>
            </div>
          </div>

          {/* Speed selector if on speed tab */}
          {activeTab === 'speed' && (
            <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/60 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-300">
                Ajustar velocidade auditiva:
              </span>
              <div className="flex items-center gap-2">
                {[0.8, 1.0, 1.25, 1.5].map((spd) => (
                  <button
                    key={spd}
                    onClick={() => setSpeedLevel(spd)}
                    className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition ${
                      speedLevel === spd
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Dictation Mode */}
          {activeTab === 'dictation' && (
            <div className="space-y-4">
              <div className="text-sm font-semibold text-slate-300">
                {currentChallenge.question || 'Digite o que você ouviu:'}
              </div>

              {currentChallenge.maskedSentence && (
                <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl font-serif text-lg text-slate-200 tracking-wide">
                  {currentChallenge.maskedSentence}
                </div>
              )}

              <div className="space-y-3">
                <textarea
                  value={dictationInput}
                  onChange={(e) => setDictationInput(e.target.value)}
                  placeholder="Escreva a frase ou palavras que você escutou em inglês..."
                  disabled={dictationSubmitted}
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-white text-base focus:outline-none focus:border-indigo-500 transition resize-none font-serif"
                />

                <div className="flex justify-end">
                  {!dictationSubmitted ? (
                    <button
                      onClick={handleCheckDictation}
                      disabled={!dictationInput.trim()}
                      className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-xl text-sm transition shadow-lg"
                    >
                      Verificar Resposta
                    </button>
                  ) : (
                    <button
                      onClick={handleNextChallenge}
                      className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-sm transition shadow-lg"
                    >
                      <span>Próximo Exercício</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Dictation Result Card */}
              {dictationSubmitted && (
                <div
                  className={`p-4 rounded-xl border space-y-2 animate-in fade-in ${
                    dictationIsCorrect
                      ? 'bg-emerald-950/30 border-emerald-800/50 text-emerald-200'
                      : 'bg-rose-950/30 border-rose-800/50 text-rose-200'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-sm">
                    {dictationIsCorrect ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>Excelente! Escuta perfeita!</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4 text-rose-400" />
                        <span>Atenção aos detalhes sonoros!</span>
                      </>
                    )}
                  </div>
                  <div className="text-xs space-y-1">
                    <div>
                      <span className="text-slate-400 font-medium">Frase Correta: </span>
                      <span className="font-semibold text-white">
                        {currentChallenge.correctAnswer}
                      </span>
                    </div>
                    {currentChallenge.explanationPt && (
                      <p className="text-slate-300 italic pt-1 border-t border-slate-700/40">
                        {currentChallenge.explanationPt}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MCQ Quiz Mode */}
          {activeTab === 'quiz' && (
            <div className="space-y-4">
              <h3 className="text-base font-semibold text-white">
                {currentChallenge.question}
              </h3>

              <div className="space-y-2.5">
                {(currentChallenge.options || []).map((opt, i) => {
                  let optStyle = 'bg-slate-800/50 border-slate-700 hover:bg-slate-800 text-slate-200';

                  if (quizSubmitted) {
                    if (opt === currentChallenge.correctAnswer) {
                      optStyle = 'bg-emerald-950/60 border-emerald-600 text-emerald-200 font-semibold';
                    } else if (opt === selectedOption) {
                      optStyle = 'bg-rose-950/60 border-rose-600 text-rose-200';
                    } else {
                      optStyle = 'opacity-40 border-slate-800';
                    }
                  }

                  return (
                    <button
                      key={i}
                      onClick={() => handleSelectOption(opt)}
                      disabled={quizSubmitted}
                      className={`w-full text-left p-4 rounded-xl border text-sm transition flex items-center justify-between gap-3 ${optStyle}`}
                    >
                      <span>{opt}</span>
                      {quizSubmitted && opt === currentChallenge.correctAnswer && (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              {quizSubmitted && (
                <div className="p-4 bg-slate-800/60 rounded-xl border border-slate-700/60 space-y-2 animate-in fade-in">
                  <div className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                    Explicação do Professor IA
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {currentChallenge.explanationPt}
                  </p>
                  <div className="flex justify-end pt-2">
                    <button
                      onClick={handleNextChallenge}
                      className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition"
                    >
                      <span>Próxima Pergunta</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Speed Challenge Mode */}
          {activeTab === 'speed' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-300 leading-relaxed">
                Desafie seu cérebro aumentando a velocidade do áudio. Ouça a frase a <span className="font-bold text-indigo-400">{speedLevel}x</span> e tente transcrever mentalmente ou em voz alta sem ler o texto:
              </p>
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-center space-y-3">
                <button
                  onClick={() => handlePlayChallengeAudio(false)}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold text-sm text-white shadow-lg inline-flex items-center gap-2"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Reproduzir a {speedLevel}x</span>
                </button>
                <div className="text-xs text-slate-400">
                  Depois de ouvir, tente pronunciar a frase no mesmo ritmo!
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};
