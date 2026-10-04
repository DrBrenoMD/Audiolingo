import React, { useState, useRef } from 'react';
import {
  Upload,
  FolderUp,
  X,
  FileAudio,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  FileText,
  Clock,
  ListOrdered,
  ArrowUp,
  ArrowDown,
  Trash2,
  HardDrive,
  Folder,
  Layers,
  Smartphone,
  ExternalLink,
} from 'lucide-react';
import { Audiobook, Chapter, Sentence } from '../types';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAudiobookCreated: (newBook: Audiobook) => void;
}

interface QueuedFile {
  file: File;
  id: string;
  name: string;
  cleanTitle: string;
  sizeMb: string;
  blobUrl: string;
}

// Natural sort for filenames like "01 - Intro.mp3", "Chapter 2.m4b", "ch10.mp3"
function naturalSortFiles(files: File[]): File[] {
  return [...files].sort((a, b) => {
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });
}

function cleanChapterTitle(filename: string): string {
  // Remove extension
  let name = filename.replace(/\.[^/.]+$/, '');
  // Replace underscores and hyphens with spaces
  name = name.replace(/[_-]/g, ' ');
  // Clean up extra spaces
  name = name.trim();
  // Capitalize nicely
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onAudiobookCreated,
}) => {
  const [uploadMode, setUploadMode] = useState<'folder' | 'multiple_files' | 'drive_guide'>('folder');
  const [queuedFiles, setQueuedFiles] = useState<QueuedFile[]>([]);
  const [bookTitle, setBookTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [level, setLevel] = useState<'Beginner' | 'Intermediate' | 'Advanced'>('Intermediate');
  const [referenceText, setReferenceText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentProcessingIndex, setCurrentProcessingIndex] = useState(0);
  const [progressStatus, setProgressStatus] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const folderInputRef = useRef<HTMLInputElement>(null);
  const multiFileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFilesSelected = (filesList: FileList | null) => {
    if (!filesList || filesList.length === 0) return;

    // Filter audio extensions (.mp3, .m4b, .m4a, .wav, .ogg, .aac)
    const validExtensions = /\.(mp3|m4b|m4a|wav|ogg|aac|webm)$/i;
    const allFiles = Array.from(filesList).filter((f) => validExtensions.test(f.name));

    if (allFiles.length === 0) {
      setErrorMsg('Nenhum arquivo de áudio válido (.mp3, .m4b, .m4a, .wav, .ogg) foi encontrado na seleção.');
      return;
    }

    setErrorMsg('');
    const sorted = naturalSortFiles(allFiles);

    // If folder was selected, extract folder name as default book title
    if (!bookTitle) {
      if (sorted[0].webkitRelativePath) {
        const folderName = sorted[0].webkitRelativePath.split('/')[0];
        if (folderName) setBookTitle(folderName.replace(/[_-]/g, ' '));
      } else {
        const firstClean = cleanChapterTitle(sorted[0].name);
        setBookTitle(firstClean.replace(/\b(chapter|capitulo|track|faixa)\b.*$/i, '').trim() || firstClean);
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

  const handleMoveFile = (idx: number, delta: number) => {
    const targetIdx = idx + delta;
    if (targetIdx < 0 || targetIdx >= queuedFiles.length) return;
    const copy = [...queuedFiles];
    const [moved] = copy.splice(idx, 1);
    copy.splice(targetIdx, 0, moved);
    setQueuedFiles(copy);
  };

  const handleRemoveFile = (idx: number) => {
    const copy = [...queuedFiles];
    const removed = copy.splice(idx, 1);
    if (removed[0]) URL.revokeObjectURL(removed[0].blobUrl);
    setQueuedFiles(copy);
  };

  const handleProcessChapters = async () => {
    if (queuedFiles.length === 0) {
      setErrorMsg('Por favor selecione uma pasta ou arquivos MP3/M4B.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg('');

    try {
      const generatedChapters: Chapter[] = [];
      const totalCount = queuedFiles.length;

      for (let i = 0; i < totalCount; i++) {
        setCurrentProcessingIndex(i);
        const item = queuedFiles[i];

        setProgressStatus(
          `Sincronizando capítulo ${i + 1} de ${totalCount}: "${item.cleanTitle}"...`
        );

        // Convert audio chunk to base64
        const buffer = await item.file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let b = 0; b < bytes.byteLength; b++) {
          binary += String.fromCharCode(bytes[b]);
        }
        const audioBase64 = btoa(binary);

        let chapterSentences: Sentence[] = [];
        let summaryPt = '';
        let estDuration = 45;

        try {
          const res = await fetch('/api/transcribe-audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audioBase64,
              mimeType: item.file.type || 'audio/mp3',
              title: item.cleanTitle,
              providedText: i === 0 && referenceText ? referenceText : undefined,
            }),
          });

          if (res.ok) {
            const data = await res.json();
            chapterSentences = data.sentences || [];
            summaryPt = data.summaryPt || '';
            estDuration = data.totalDurationEstimate || (chapterSentences[chapterSentences.length - 1]?.end ?? 60);
          }
        } catch (apiErr) {
          console.warn(`Could not transcribe chapter ${item.cleanTitle}, fallback to basic sentences`, apiErr);
          // Fallback minimal structure if audio is long or quota hit
          chapterSentences = [
            {
              id: `s-${i}-1`,
              index: 0,
              start: 0,
              end: 15,
              text: `Chapter audio: ${item.cleanTitle}`,
              translationPt: `Áudio do capítulo: ${item.cleanTitle}`,
              words: [
                { word: 'Chapter', cleanWord: 'chapter', start: 0, end: 3, index: 0 },
                { word: 'audio', cleanWord: 'audio', start: 3.2, end: 6, index: 1 },
                { word: item.cleanTitle, cleanWord: item.cleanTitle.toLowerCase(), start: 6.2, end: 12, index: 2 },
              ],
            },
          ];
        }

        generatedChapters.push({
          id: `ch-${Date.now()}-${i}`,
          chapterNumber: i + 1,
          title: item.cleanTitle,
          fileName: item.name,
          audioUrl: item.blobUrl,
          duration: estDuration,
          summaryPt,
          sentences: chapterSentences,
          status: 'ready',
        });
      }

      // Build complete Audiobook
      const finalTitle = bookTitle.trim() || 'Audiolivro Multicapítulos';
      const firstChapter = generatedChapters[0];

      const newAudiobook: Audiobook = {
        id: `custom-multi-${Date.now()}`,
        title: finalTitle,
        author: author.trim() || 'Coleção de Capítulos',
        coverUrl:
          'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=600&auto=format&fit=crop&q=80',
        audioUrl: firstChapter.audioUrl,
        duration: generatedChapters.reduce((acc, c) => acc + c.duration, 0),
        description: `Audiolivro completo com ${generatedChapters.length} capítulos (MP3/M4B).`,
        level,
        category: 'Custom Folder Upload',
        chapters: generatedChapters,
        currentChapterIndex: 0,
        sentences: firstChapter.sentences,
        summaryPt: firstChapter.summaryPt,
      };

      onAudiobookCreated(newAudiobook);
      onClose();
    } catch (err: any) {
      console.error('Error batch processing:', err);
      setErrorMsg(err.message || 'Erro durante a importação da pasta.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
      <div
        className="w-full max-w-3xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100 max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/95 sticky top-0 z-10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <FolderUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Importar Audiolivro (Pastas, MP3 ou M4B)</h3>
              <p className="text-xs text-slate-400">
                Suporte nativo para pastas inteiras com múltiplos capítulos, arquivos do PC, Google Drive ou Android.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switchers: Folder Upload vs Multiple Files vs Android/Drive Tips */}
        <div className="px-6 pt-4 border-b border-slate-800 flex items-center gap-2 bg-slate-950/40">
          <button
            onClick={() => setUploadMode('folder')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 text-xs font-semibold transition ${
              uploadMode === 'folder'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Folder className="w-4 h-4" />
            <span>Upload de Pasta Inteira (Todos os Capítulos)</span>
          </button>

          <button
            onClick={() => setUploadMode('multiple_files')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 text-xs font-semibold transition ${
              uploadMode === 'multiple_files'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Múltiplos Arquivos MP3 / M4B</span>
          </button>

          <button
            onClick={() => setUploadMode('drive_guide')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 text-xs font-semibold transition ${
              uploadMode === 'drive_guide'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>Android & Google Drive</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-6 custom-scrollbar">
          {errorMsg && (
            <div className="p-3.5 bg-rose-950/40 border border-rose-800/60 rounded-xl text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {uploadMode === 'drive_guide' && (
            <div className="p-4 bg-indigo-950/30 border border-indigo-800/40 rounded-2xl space-y-3 text-xs text-slate-300">
              <div className="flex items-center gap-2 text-indigo-300 font-bold text-sm">
                <HardDrive className="w-4 h-4" />
                <span>Como usar arquivos do Google Drive ou celular Android:</span>
              </div>
              <ul className="space-y-2 list-disc list-inside text-slate-300 leading-relaxed">
                <li>
                  <strong className="text-white">No Android:</strong> Ao clicar no botão de upload abaixo, o seletor nativo de arquivos do Android se abrirá. Você pode navegar direto pelo app <strong className="text-indigo-400">Arquivos</strong> ou <strong className="text-indigo-400">Google Drive</strong> e selecionar todos os arquivos MP3/M4B de uma vez.
                </li>
                <li>
                  <strong className="text-white">No Computador / Drive para Desktop:</strong> Se você sincroniza seu Google Drive no computador, basta selecionar a pasta sincronizada na aba <em>"Upload de Pasta Inteira"</em>.
                </li>
                <li>
                  <strong className="text-white">Formato M4B com múltiplos capítulos:</strong> O sistema detecta os nomes de faixas ordenados numericamente (01, 02, etc.) automaticamente.
                </li>
              </ul>
            </div>
          )}

          {/* Hidden Inputs */}
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

          {/* Upload Dropzone */}
          {queuedFiles.length === 0 ? (
            <div
              onClick={() => {
                if (uploadMode === 'folder') {
                  folderInputRef.current?.click();
                } else {
                  multiFileInputRef.current?.click();
                }
              }}
              className="border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-2xl p-8 text-center cursor-pointer transition hover:bg-slate-800/40 space-y-3"
            >
              <div className="w-14 h-14 bg-indigo-950/80 border border-indigo-700/50 rounded-2xl flex items-center justify-center mx-auto text-indigo-400 shadow-lg">
                {uploadMode === 'folder' ? <FolderUp className="w-7 h-7" /> : <Layers className="w-7 h-7" />}
              </div>
              <div>
                <p className="text-base font-bold text-white">
                  {uploadMode === 'folder'
                    ? 'Clique para selecionar a pasta do audiolivro'
                    : 'Clique para selecionar todos os arquivos MP3 / M4B'}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Reconhece todos os arquivos de capítulos, ordena numericamente e prepara para reprodução.
                </p>
              </div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-800 border border-slate-700 rounded-full text-[11px] text-slate-300 font-mono">
                Suporta: .MP3, .M4B, .M4A, .WAV, .OGG
              </div>
            </div>
          ) : (
            /* Detected Chapters Queue */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-400 tracking-wider">
                  <ListOrdered className="w-4 h-4 text-indigo-400" />
                  <span>
                    {queuedFiles.length} Capítulos Detectados (Organizados em Ordem)
                  </span>
                </div>

                <button
                  onClick={() => {
                    if (uploadMode === 'folder') folderInputRef.current?.click();
                    else multiFileInputRef.current?.click();
                  }}
                  className="text-xs text-indigo-400 hover:underline font-semibold"
                >
                  Selecionar outra pasta/arquivos
                </button>
              </div>

              {/* Chapters List */}
              <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar p-1">
                {queuedFiles.map((fileItem, idx) => (
                  <div
                    key={fileItem.id}
                    className="flex items-center justify-between gap-3 p-3 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 rounded-xl text-xs transition"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <span className="w-6 h-6 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center font-mono font-bold text-indigo-400 shrink-0">
                        {idx + 1}
                      </span>
                      <div className="overflow-hidden">
                        <div className="font-semibold text-white truncate">
                          {fileItem.cleanTitle}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {fileItem.name} • {fileItem.sizeMb} MB
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleMoveFile(idx, -1)}
                        disabled={idx === 0}
                        className="p-1 text-slate-400 hover:text-white disabled:opacity-20"
                        title="Mover para cima"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleMoveFile(idx, 1)}
                        disabled={idx === queuedFiles.length - 1}
                        className="p-1 text-slate-400 hover:text-white disabled:opacity-20"
                        title="Mover para baixo"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleRemoveFile(idx)}
                        className="p-1 text-slate-500 hover:text-rose-400"
                        title="Remover capítulo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metadata Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Título Geral do Audiolivro</label>
              <input
                type="text"
                value={bookTitle}
                onChange={(e) => setBookTitle(e.target.value)}
                placeholder="Ex: The Lord of the Rings: The Fellowship"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Autor / Narrador</label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Ex: J.R.R. Tolkien (Narrado por Rob Inglis)"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition"
              />
            </div>
          </div>

          {/* Level */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300">Nível Estimado de Dificuldade</label>
            <div className="grid grid-cols-3 gap-2">
              {(['Beginner', 'Intermediate', 'Advanced'] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setLevel(lvl)}
                  className={`py-2 text-xs font-semibold rounded-xl border transition ${
                    level === lvl
                      ? 'bg-indigo-600 text-white border-indigo-500'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>

          {/* Optional Reference text */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-300 font-semibold">
              <span className="flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-indigo-400" />
                Texto ou Roteiro de Referência em Inglês (Opcional)
              </span>
            </div>
            <textarea
              value={referenceText}
              onChange={(e) => setReferenceText(e.target.value)}
              placeholder="Se tiver o e-book ou transcrição em texto, cole aqui para obter precisão perfeita de palavras..."
              rows={3}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-indigo-500 transition resize-none font-serif"
            />
          </div>

          {/* Progress Status Bar during processing */}
          {isProcessing && (
            <div className="p-4 bg-indigo-950/40 border border-indigo-800/50 rounded-xl space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between text-xs text-indigo-300 font-semibold">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 animate-spin text-indigo-400" />
                  <span>{progressStatus}</span>
                </div>
                <span>
                  {currentProcessingIndex + 1} de {queuedFiles.length}
                </span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full transition-all duration-300"
                  style={{
                    width: `${((currentProcessingIndex + 1) / queuedFiles.length) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/95 flex items-center justify-between sticky bottom-0 z-10">
          <div className="text-xs text-slate-400">
            {queuedFiles.length > 0 && `${queuedFiles.length} capítulo(s) pronto(s) para importação`}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2 text-sm text-slate-400 hover:text-white transition"
            >
              Cancelar
            </button>
            <button
              onClick={handleProcessChapters}
              disabled={isProcessing || queuedFiles.length === 0}
              className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition shadow-lg shadow-indigo-950/50 active:scale-95"
            >
              <Sparkles className="w-4 h-4" />
              <span>
                {isProcessing
                  ? 'Sincronizando Capítulos...'
                  : queuedFiles.length > 1
                  ? `Importar Todos os ${queuedFiles.length} Capítulos`
                  : 'Importar Audiolivro'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
