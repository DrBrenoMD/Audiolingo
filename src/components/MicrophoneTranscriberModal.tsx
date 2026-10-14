import React, { useState, useRef, useEffect } from 'react';
import {
  Mic,
  Square,
  Sparkles,
  Volume2,
  Copy,
  Check,
  BookmarkPlus,
  Loader2,
  AlertCircle,
  X,
  Upload,
  RefreshCw,
  FileAudio,
} from 'lucide-react';
import { audioEngine } from '../utils/audioEngine';
import confetti from 'canvas-confetti';
import { SRSFlashcard } from '../types';

interface MicrophoneTranscriberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveToSRS?: (card: Partial<SRSFlashcard>) => void;
  onNavigateToSpeaking?: (text: string) => void;
}

export const MicrophoneTranscriberModal: React.FC<MicrophoneTranscriberModalProps> = ({
  isOpen,
  onClose,
  onSaveToSRS,
  onNavigateToSpeaking,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [translationPt, setTranslationPt] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [warningMessage, setWarningMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [savedSRS, setSavedSRS] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [activeEngineModel, setActiveEngineModel] = useState<string>('Whisper Large v3 Turbo (8h/dia grátis)');
  const [limitDescription, setLimitDescription] = useState<string>('8 horas de áudio por dia grátis');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/transcription-provider-info')
      .then((r) => r.json())
      .then((d) => {
        if (d.activeModel) {
          setActiveEngineModel(d.activeModel === 'whisper-large-v3-turbo' ? 'Whisper Large v3 Turbo (8h/dia grátis)' : d.activeModel);
        }
        if (d.limitDescription) {
          setLimitDescription(d.limitDescription);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  if (!isOpen) return null;

  const startRecording = async () => {
    try {
      setErrorMessage('');
      setWarningMessage('');
      setTranscript('');
      setTranslationPt('');
      setSavedSRS(false);
      setRecordingSeconds(0);
      audioChunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);

        stream.getTracks().forEach((track) => track.stop());
        await processAudioTranscription(audioBlob, mimeType);
      };

      recorder.start(250);
      setIsRecording(true);

      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Microphone access denied:', err);
      setErrorMessage('Permissão do microfone negada. Conceda permissão no navegador para falar.');
    }
  };

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (audioUrl) URL.revokeObjectURL(audioUrl);
    const url = URL.createObjectURL(file);
    setAudioUrl(url);

    const mime = file.type || 'audio/wav';
    await processAudioTranscription(file, mime);
  };

  const processAudioTranscription = async (blob: Blob, mimeType: string) => {
    setIsTranscribing(true);
    setErrorMessage('');
    setWarningMessage('');

    try {
      const buffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: base64,
          mimeType,
          prompt: 'Transcribe this audio.',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.warning) setWarningMessage(data.warning);
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      if (data.warning) {
        setWarningMessage(data.warning);
      }

      const text = data.transcript?.trim() || '';
      setTranscript(text);
      setTranslationPt(data.translationPt || '');

      if (text) {
        confetti({
          particleCount: 30,
          spread: 60,
          origin: { y: 0.8 },
          colors: ['#6366f1', '#10b981'],
        });
      }
    } catch (err: any) {
      console.error('Transcription error:', err);
      setErrorMessage(err.message || 'Falha ao transcrever o áudio');
    } finally {
      setIsTranscribing(false);
    }
  };

  const copyTranscript = () => {
    if (!transcript) return;
    navigator.clipboard.writeText(transcript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveSRS = () => {
    if (!transcript || !onSaveToSRS) return;
    onSaveToSRS({
      type: 'sentence',
      frontText: transcript,
      backTranslation: translationPt || 'Áudio transcrito com microfone',
      contextSentence: transcript,
      notes: `Gravado com microfone · ${activeEngineModel}`,
    });
    setSavedSRS(true);
    setTimeout(() => setSavedSRS(false), 2500);
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in text-slate-100">
      <div
        className="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/95">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
              <Mic className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Transcrever Áudio com Microfone</h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono border border-emerald-500/30 font-semibold">
                  {activeEngineModel}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Grave sua voz e obtenha transcrição instantânea com Whisper Large v3 Turbo ({limitDescription}).
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Warning Message if Key Missing on Vercel */}
          {warningMessage && (
            <div className="p-3.5 rounded-xl bg-amber-950/70 border border-amber-600/60 text-xs text-amber-200 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-white">Aviso de Configuração:</p>
                <p className="mt-0.5 text-amber-300 leading-relaxed">{warningMessage}</p>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-600/60 text-xs text-rose-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Record Section */}
          <div className="flex flex-col items-center justify-center p-8 rounded-2xl bg-slate-950/60 border border-slate-800 text-center space-y-4">
            <div className="relative">
              {isRecording && (
                <div className="absolute inset-0 rounded-full bg-rose-500/30 animate-ping"></div>
              )}
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isTranscribing}
                className={`w-20 h-20 rounded-full flex items-center justify-center transition shadow-2xl relative z-10 ${
                  isRecording
                    ? 'bg-rose-600 hover:bg-rose-500 text-white animate-pulse'
                    : isTranscribing
                    ? 'bg-emerald-900/60 text-emerald-300 cursor-wait'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30 hover:scale-105 active:scale-95'
                }`}
                title={isRecording ? 'Clique para parar e transcrever' : 'Clique para começar a gravar pelo microfone'}
              >
                {isTranscribing ? (
                  <Loader2 className="w-8 h-8 animate-spin" />
                ) : isRecording ? (
                  <Square className="w-8 h-8 fill-current" />
                ) : (
                  <Mic className="w-8 h-8" />
                )}
              </button>
            </div>

            <div className="space-y-1">
              {isRecording ? (
                <>
                  <div className="flex items-center justify-center gap-2 text-rose-400 font-mono font-bold text-sm">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping"></span>
                    <span>Gravando Microfone: {formatTimer(recordingSeconds)}</span>
                  </div>
                  <p className="text-xs text-slate-400">Clique no botão quadrado vermelho quando terminar de falar.</p>
                </>
              ) : isTranscribing ? (
                <>
                  <p className="text-sm font-bold text-emerald-300 flex items-center justify-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-400 animate-spin" />
                    Transcrevendo com {activeEngineModel}...
                  </p>
                  <p className="text-xs text-slate-400">Processando áudio com IA de alta precisão...</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-white">
                    {transcript ? 'Clique para gravar novamente' : 'Clique no microfone para falar'}
                  </p>
                  <p className="text-xs text-slate-400 max-w-sm">
                    Fale em inglês (ou em qualquer idioma). O modelo <span className="text-emerald-400 font-mono font-semibold">{activeEngineModel}</span> converterá sua voz em texto com precisão.
                  </p>
                </>
              )}
            </div>

            {/* Or upload audio file */}
            <div className="pt-2 border-t border-slate-800/80 w-full flex items-center justify-center gap-3">
              <span className="text-xs text-slate-500">ou</span>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isRecording || isTranscribing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 transition border border-slate-700"
              >
                <Upload className="w-3.5 h-3.5 text-indigo-400" />
                <span>Enviar Arquivo de Áudio (.wav, .mp3, .m4a, .webm)</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>
          </div>

          {/* Result Section */}
          {transcript && (
            <div className="p-5 rounded-2xl bg-indigo-950/30 border border-indigo-500/40 space-y-4 shadow-xl">
              <div className="flex items-center justify-between gap-2 border-b border-indigo-900/40 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
                    Texto Transcrito:
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium">
                    100% Verbatim
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => audioEngine.speakText(transcript)}
                    className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition"
                    title="Ouvir texto com voz sintética"
                  >
                    <Volume2 className="w-4 h-4 text-teal-400" />
                  </button>
                  <button
                    onClick={copyTranscript}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition"
                    title="Copiar transcrição para área de transferência"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-lg font-serif text-white leading-relaxed select-text">
                  "{transcript}"
                </p>

                {translationPt && (
                  <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300 space-y-1">
                    <span className="font-semibold text-slate-400 text-[10px] uppercase">
                      Tradução em Português:
                    </span>
                    <p className="italic text-slate-200">{translationPt}</p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 flex-wrap">
                {onNavigateToSpeaking && (
                  <button
                    onClick={() => {
                      onNavigateToSpeaking(transcript);
                      onClose();
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 transition border border-slate-700"
                  >
                    <Mic className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Praticar no Speaking Lab</span>
                  </button>
                )}

                {onSaveToSRS && (
                  <button
                    onClick={handleSaveSRS}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition shadow"
                  >
                    {savedSRS ? <Check className="w-3.5 h-3.5" /> : <BookmarkPlus className="w-3.5 h-3.5" />}
                    <span>{savedSRS ? 'Salvo no Baralho' : 'Salvar no Baralho SRS'}</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400">
          <span className="font-mono text-[11px] text-slate-500">
            Powered by Google Gemini 3.5 Transcribe
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
