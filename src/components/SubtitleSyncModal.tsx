import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  FileText,
  Subtitles,
  Check,
  AlertCircle,
  Sparkles,
  Clipboard,
  HelpCircle,
} from 'lucide-react';
import { Sentence } from '../types';
import { extractBookFromFile, parseSubtitleFile } from '../utils/textExtractor';
import { alignTextToAudio } from '../utils/fuzzyAligner';

interface SubtitleSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  audioDuration: number;
  chapterTitle: string;
  onSentencesAligned: (newSentences: Sentence[]) => void;
}

export const SubtitleSyncModal: React.FC<SubtitleSyncModalProps> = ({
  isOpen,
  onClose,
  audioDuration,
  chapterTitle,
  onSentencesAligned,
}) => {
  const [tab, setTab] = useState<'file' | 'paste'>('file');
  const [pastedText, setPastedText] = useState('');
  const [leadInSec, setLeadInSec] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelected = async (file: File) => {
    setIsProcessing(true);
    setErrorMsg('');
    setStatusMessage('Lendo arquivo de legenda ou texto...');

    try {
      const ext = file.name.split('.').pop()?.toLowerCase();

      if (ext === 'srt' || ext === 'vtt') {
        setStatusMessage('Extraindo legendas com timestamps exatos (.srt/.vtt)...');
        const content = await file.text();
        const cues = parseSubtitleFile(content);

        if (!cues || cues.length === 0) {
          throw new Error('Nenhuma legenda com formato válido (.srt/.vtt) foi encontrada.');
        }

        const formattedSentences: Sentence[] = cues.map((cue, idx) => {
          const rawWords = cue.text.split(/\s+/).filter(Boolean);
          const duration = Math.max(0.4, cue.end - cue.start);
          const wordDur = duration / Math.max(1, rawWords.length);

          return {
            id: `srt-${Date.now()}-${idx}`,
            index: idx,
            start: +cue.start.toFixed(2),
            end: +cue.end.toFixed(2),
            text: cue.text,
            translationPt: '',
            words: rawWords.map((w, wIdx) => ({
              word: w,
              cleanWord: w.replace(/[^a-zA-Z0-9']/g, '').toLowerCase(),
              start: +(cue.start + wIdx * wordDur).toFixed(2),
              end: +(cue.start + (wIdx + 1) * wordDur).toFixed(2),
              index: wIdx,
            })),
          };
        });

        setStatusMessage(`Sincronizadas ${formattedSentences.length} frases com timestamps nativos!`);
        onSentencesAligned(formattedSentences);
        setIsProcessing(false);
        onClose();
        return;
      }

      // Plain text, EPUB, or PDF
      setStatusMessage('Extraindo texto do livro (.txt, .epub, .pdf)...');
      const extracted = await extractBookFromFile(file);

      if (!extracted.sentences || extracted.sentences.length === 0) {
        throw new Error('Não foi possível extrair frases de texto do arquivo.');
      }

      setStatusMessage(`Alinhando ${extracted.sentences.length} frases com a cadência do áudio (${Math.round(audioDuration)}s)...`);
      const aligned = alignTextToAudio(extracted.sentences, audioDuration, {
        leadInSeconds: leadInSec || 0,
      });

      onSentencesAligned(aligned);
      setIsProcessing(false);
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Falha ao sincronizar arquivo');
      setIsProcessing(false);
    }
  };

  const handlePasteSubmit = () => {
    if (!pastedText.trim()) {
      setErrorMsg('Cole o texto do capítulo antes de alinhar.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg('');

    try {
      // Check if user pasted an SRT format
      if (pastedText.includes('-->')) {
        const cues = parseSubtitleFile(pastedText);
        if (cues && cues.length > 0) {
          const formattedSentences: Sentence[] = cues.map((cue, idx) => {
            const rawWords = cue.text.split(/\s+/).filter(Boolean);
            const duration = Math.max(0.4, cue.end - cue.start);
            const wordDur = duration / Math.max(1, rawWords.length);
            return {
              id: `srt-paste-${Date.now()}-${idx}`,
              index: idx,
              start: +cue.start.toFixed(2),
              end: +cue.end.toFixed(2),
              text: cue.text,
              translationPt: '',
              words: rawWords.map((w, wIdx) => ({
                word: w,
                cleanWord: w.replace(/[^a-zA-Z0-9']/g, '').toLowerCase(),
                start: +(cue.start + wIdx * wordDur).toFixed(2),
                end: +(cue.start + (wIdx + 1) * wordDur).toFixed(2),
                index: wIdx,
              })),
            };
          });
          onSentencesAligned(formattedSentences);
          setIsProcessing(false);
          onClose();
          return;
        }
      }

      // Plain text
      const rawSentences = pastedText
        .split(/(?<=[.?!])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      const aligned = alignTextToAudio(rawSentences, audioDuration, {
        leadInSeconds: leadInSec || 0,
      });

      onSentencesAligned(aligned);
      setIsProcessing(false);
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Falha ao alinhar texto colado');
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <Subtitles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Sincronizar Legenda ou Texto</h2>
              <p className="text-xs text-slate-400">
                Capítulo: <span className="text-slate-200 font-medium">{chapterTitle}</span> ({Math.round(audioDuration)}s)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab selection */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 p-1 gap-1">
          <button
            onClick={() => setTab('file')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-2 ${
              tab === 'file'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Arquivo (.srt, .vtt, .txt, .epub, .pdf)</span>
          </button>
          <button
            onClick={() => setTab('paste')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-2 ${
              tab === 'paste'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Clipboard className="w-3.5 h-3.5" />
            <span>Colar Texto do Capítulo</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {tab === 'file' ? (
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-indigo-500/40 hover:border-indigo-400 bg-slate-950/50 hover:bg-indigo-950/20 rounded-2xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center gap-3"
              >
                <div className="p-3 rounded-full bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                  <Upload className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">
                    Clique para selecionar arquivo de Legenda ou Livro
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Formatos suportados: <span className="text-indigo-300">.SRT</span> (ideal),{' '}
                    <span className="text-indigo-300">.VTT</span>,{' '}
                    <span className="text-indigo-300">.TXT</span>,{' '}
                    <span className="text-indigo-300">.EPUB</span>,{' '}
                    <span className="text-indigo-300">.PDF</span>
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".srt,.vtt,.txt,.epub,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelected(f);
                  }}
                />
              </div>

              <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-3 text-xs text-slate-300 space-y-1.5">
                <div className="flex items-center gap-2 font-medium text-indigo-300">
                  <HelpCircle className="w-4 h-4 text-indigo-400" />
                  <span>Como funciona a sincronização 100% Sem IA:</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-slate-400 pl-1">
                  <li>
                    <strong className="text-slate-200">Arquivos .SRT ou .VTT:</strong> Cada frase e palavra é alinhada com precisão milimétrica usando os marcadores originais da legenda.
                  </li>
                  <li>
                    <strong className="text-slate-200">Arquivos de Texto ou Livro:</strong> O alinhador divide as frases e distribui os tempos proporcionalmente com base na cadência e contagem silábica.
                  </li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Cole o texto em inglês deste capítulo (ou cole o conteúdo de um .srt):
                </label>
                <textarea
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder="Ex: My name is Ryland Grace, and I'm the only survivor of the mission... (ou cole blocos com números e timestamps)"
                  rows={8}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none font-mono"
                />
              </div>

              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>{pastedText.split(/\s+/).filter(Boolean).length} palavras detectadas</span>
                <button
                  type="button"
                  onClick={handlePasteSubmit}
                  disabled={isProcessing || !pastedText.trim()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-lg transition flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Alinhar Texto com o Áudio</span>
                </button>
              </div>
            </div>
          )}

          {/* Lead-in adjustment */}
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
            <span className="text-slate-400">Silêncio/Abertura no início (Lead-in):</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="30"
                step="0.5"
                value={leadInSec}
                onChange={(e) => setLeadInSec(parseFloat(e.target.value) || 0)}
                className="w-16 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-right text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
              />
              <span className="text-slate-400">segundos</span>
            </div>
          </div>

          {statusMessage && (
            <div className="p-3 bg-indigo-950/40 border border-indigo-800/50 rounded-xl text-xs text-indigo-300 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400 animate-spin" />
              <span>{statusMessage}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
