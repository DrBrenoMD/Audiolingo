import React, { useState, useRef, useEffect } from 'react';
import {
  Mic,
  Square,
  Play,
  RotateCcw,
  Sparkles,
  Volume2,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import { Sentence, SpeakingEvaluationResult, Audiobook } from '../types';
import { audioEngine } from '../utils/audioEngine';
import confetti from 'canvas-confetti';

interface SpeakingLabProps {
  currentAudiobook: Audiobook;
  initialSentence?: string;
  onRecordAttempt?: () => void;
}

export const SpeakingLab: React.FC<SpeakingLabProps> = ({
  currentAudiobook,
  initialSentence = '',
  onRecordAttempt,
}) => {
  const [selectedSentenceText, setSelectedSentenceText] = useState<string>(
    initialSentence || currentAudiobook.sentences[0]?.text || ''
  );
  const [isRecording, setIsRecording] = useState(false);
  const [userAudioUrl, setUserAudioUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [evaluation, setEvaluation] = useState<SpeakingEvaluationResult | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (initialSentence) {
      setSelectedSentenceText(initialSentence);
      setEvaluation(null);
      setUserAudioUrl(null);
    }
  }, [initialSentence]);

  // Clean up audio blob URL on unmount
  useEffect(() => {
    return () => {
      if (userAudioUrl) URL.revokeObjectURL(userAudioUrl);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [userAudioUrl]);

  // Start recording
  const startRecording = async () => {
    try {
      setUserAudioUrl(null);
      setEvaluation(null);
      setRecordingSeconds(0);
      audioChunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(audioBlob);
        setUserAudioUrl(url);

        // Stop all audio tracks
        stream.getTracks().forEach((track) => track.stop());

        // Trigger AI evaluation
        handleEvaluate(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);

      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Microphone access denied:', err);
      alert('Por favor, permita o acesso ao microfone no seu navegador para praticar o speaking.');
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  // Run Traditional Phonetic Evaluation
  const handleEvaluate = async (audioBlob?: Blob) => {
    setAnalyzing(true);

    try {
      // Convert audioBlob to base64 if available
      let audioBase64 = '';
      if (audioBlob) {
        const buffer = await audioBlob.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        audioBase64 = btoa(binary);
      }

      const res = await fetch('/api/speaking-evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetSentence: selectedSentenceText,
          transcribedSpeech: selectedSentenceText, // reference target
          audioBase64: audioBase64 || undefined,
        }),
      });

      if (res.ok) {
        const data: SpeakingEvaluationResult = await res.json();
        setEvaluation(data);
        onRecordAttempt?.();

        if (data.overallScore >= 80) {
          confetti({
            particleCount: 50,
            spread: 70,
            origin: { y: 0.7 },
            colors: ['#10b981', '#6366f1', '#f59e0b'],
          });
        }
      }
    } catch (err) {
      console.error('Evaluation error:', err);
    } finally {
      setAnalyzing(false);
    }
  };

  const handlePlayOriginal = () => {
    audioEngine.speakText(selectedSentenceText);
  };

  const handlePlayUserRecording = () => {
    if (userAudioUrl) {
      const audio = new Audio(userAudioUrl);
      audio.play();
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-8 text-slate-100">
      {/* Title */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <Mic className="w-6 h-6 text-emerald-400" />
            <span>Laboratório de Speaking & Shadowing com IA</span>
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Grave sua fala, receba notas detalhadas de pronúncia, fonética e dicas específicas para brasileiros.
          </p>
        </div>

        {/* Quick Sentence Picker */}
        <select
          value={selectedSentenceText}
          onChange={(e) => {
            setSelectedSentenceText(e.target.value);
            setEvaluation(null);
            setUserAudioUrl(null);
          }}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 max-w-xs truncate"
        >
          {currentAudiobook.sentences.map((s, idx) => (
            <option key={s.id} value={s.text}>
              {idx + 1}. {s.text.slice(0, 45)}...
            </option>
          ))}
        </select>
      </div>

      {/* Target Sentence Card */}
      <div className="bg-slate-900/80 border border-slate-700/80 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider">
          <span>Frase Alvo para Repetir (Shadowing)</span>
          <span className="text-indigo-400">{currentAudiobook.title}</span>
        </div>

        <p className="text-xl sm:text-2xl font-serif text-white leading-relaxed">
          "{selectedSentenceText}"
        </p>

        {/* Controls: Listen Original */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handlePlayOriginal}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white rounded-xl text-sm font-semibold transition shadow-lg shadow-indigo-950/40"
          >
            <Volume2 className="w-4 h-4" />
            <span>Ouvir Pronúncia Original</span>
          </button>

          {userAudioUrl && (
            <button
              onClick={handlePlayUserRecording}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 border border-slate-700 rounded-xl text-sm font-semibold transition"
            >
              <Play className="w-4 h-4 text-emerald-400" />
              <span>Ouvir Sua Gravação</span>
            </button>
          )}
        </div>
      </div>

      {/* Microphone Record Station */}
      <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-6">
        <div className="relative">
          {/* Animated pulse rings during recording */}
          {isRecording && (
            <>
              <div className="absolute -inset-4 rounded-full bg-rose-500/20 animate-ping pointer-events-none" />
              <div className="absolute -inset-8 rounded-full bg-rose-500/10 animate-pulse pointer-events-none" />
            </>
          )}

          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`w-20 h-20 rounded-full flex items-center justify-center shadow-2xl transition-all duration-200 active:scale-90 ${
              isRecording
                ? 'bg-rose-600 hover:bg-rose-500 text-white ring-4 ring-rose-500/40'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white ring-4 ring-emerald-500/20'
            }`}
          >
            {isRecording ? (
              <Square className="w-8 h-8 fill-current" />
            ) : (
              <Mic className="w-8 h-8" />
            )}
          </button>
        </div>

        <div>
          <div className="text-base font-semibold text-white">
            {isRecording ? 'Gravando sua voz... Fale a frase em inglês!' : 'Clique no microfone para gravar'}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {isRecording
              ? `Tempo: ${recordingSeconds}s • Clique para finalizar e avaliar`
              : 'Dica: Repita no mesmo ritmo e entonação do falante nativo.'}
          </p>
        </div>

        {analyzing && (
          <div className="flex items-center gap-2 text-indigo-400 text-sm animate-pulse">
            <Sparkles className="w-4 h-4 animate-spin" />
            <span>Avaliando pronúncia, fonemas e clareza com IA...</span>
          </div>
        )}
      </div>

      {/* AI Pronunciation Evaluation Results */}
      {evaluation && (
        <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-6 shadow-2xl space-y-6 animate-in fade-in duration-300">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              <h3 className="text-lg font-bold text-white">Resultado da Análise de Pronúncia</h3>
            </div>

            {/* Overall Score Badge */}
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-xs text-slate-400 uppercase font-semibold">Nota Geral</div>
                <div
                  className={`text-2xl font-black ${
                    evaluation.overallScore >= 80
                      ? 'text-emerald-400'
                      : evaluation.overallScore >= 60
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }`}
                >
                  {evaluation.overallScore}%
                </div>
              </div>
            </div>
          </div>

          {/* Sub-scores */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/50">
              <span className="text-xs text-slate-400">Precisão Fonética</span>
              <div className="text-xl font-bold text-indigo-300 mt-0.5">
                {evaluation.accuracyScore}%
              </div>
            </div>
            <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/50">
              <span className="text-xs text-slate-400">Fluência & Ritmo</span>
              <div className="text-xl font-bold text-purple-300 mt-0.5">
                {evaluation.fluencyScore}%
              </div>
            </div>
            <div className="col-span-2 sm:col-span-1 bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/50">
              <span className="text-xs text-slate-400">Fonemas Críticos</span>
              <div className="flex gap-1.5 mt-1 font-mono text-xs text-amber-300">
                {evaluation.phonemeFocus?.map((ph, idx) => (
                  <span key={idx} className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                    {ph}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Word-by-Word Color Breakdown */}
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
              Análise Palavra por Palavra (Verde = Ótima, Amarelo = Atenção, Vermelho = Melhorar)
            </div>
            <div className="flex flex-wrap gap-2 p-4 bg-slate-950/60 rounded-xl border border-slate-800">
              {evaluation.wordAnalysis?.map((w, idx) => {
                let badgeClass = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
                if (w.status === 'average')
                  badgeClass = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
                if (w.status === 'poor')
                  badgeClass = 'bg-rose-500/20 text-rose-300 border-rose-500/40';

                return (
                  <div key={idx} className="group relative">
                    <span
                      className={`inline-block px-3 py-1 rounded-lg border text-sm font-semibold transition ${badgeClass}`}
                    >
                      {w.word}
                    </span>
                    {w.tip && (
                      <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-800 text-xs text-slate-200 rounded-lg shadow-xl border border-slate-700 z-10 pointer-events-none">
                        {w.tip}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Specific Advice for Brazilians */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-emerald-950/20 border border-emerald-800/40 rounded-xl space-y-1.5">
              <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Pontos Fortes
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {evaluation.positiveFeedbackPt}
              </p>
            </div>

            <div className="p-4 bg-amber-950/20 border border-amber-800/40 rounded-xl space-y-1.5">
              <div className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" />
                Como Melhorar
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {evaluation.improvementTipsPt}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
