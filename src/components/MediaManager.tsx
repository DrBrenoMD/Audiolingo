import React, { useState, useRef } from 'react';
import {
  FolderOpen,
  Plus,
  Play,
  Pause,
  Trash2,
  Edit2,
  FileText,
  Clock,
  BookOpen,
  Search,
  Upload,
  Sparkles,
  Check,
  X,
  Volume2,
  Sliders,
  Layers,
  HardDrive,
  AlertCircle,
  FileUp,
} from 'lucide-react';
import { Audiobook, Chapter, Sentence } from '../types';
import { extractBookFromFile } from '../utils/textExtractor';
import { alignTextToAudio } from '../utils/fuzzyAligner';

interface MediaManagerProps {
  audiobooks: Audiobook[];
  currentBookId: string;
  onSelectBook: (book: Audiobook) => void;
  onUpdateBook: (updated: Audiobook) => void;
  onDeleteBook: (bookId: string) => void;
  onAddBook: (newBook: Audiobook) => void;
  onClose?: () => void;
}

export const MediaManager: React.FC<MediaManagerProps> = ({
  audiobooks,
  currentBookId,
  onSelectBook,
  onUpdateBook,
  onDeleteBook,
  onAddBook,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [previewPlayingId, setPreviewPlayingId] = useState<string | null>(null);

  // Edit modal state
  const [editingBook, setEditingBook] = useState<Audiobook | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editAuthor, setEditAuthor] = useState('');
  const [editLevel, setEditLevel] = useState<'Beginner' | 'Intermediate' | 'Advanced'>('Intermediate');

  // Delete modal state
  const [deletingBookId, setDeletingBookId] = useState<string | null>(null);

  // Smart Audio + Text Upload Modal State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadAudioFile, setUploadAudioFile] = useState<File | null>(null);
  const [uploadTextFile, setUploadTextFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newAuthor, setNewAuthor] = useState('');
  const [newLevel, setNewLevel] = useState<'Beginner' | 'Intermediate' | 'Advanced'>('Intermediate');
  const [leadInSeconds, setLeadInSeconds] = useState<number>(0.0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStatus, setProcessStatus] = useState('');
  const [extractedSentenceCount, setExtractedSentenceCount] = useState(0);

  const audioInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Filter audiobooks
  const filteredBooks = audiobooks.filter((book) => {
    const matchesQuery =
      book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      book.author.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesLevel = selectedLevel === 'all' || book.level.toLowerCase() === selectedLevel.toLowerCase();
    return matchesQuery && matchesLevel;
  });

  // Calculate statistics
  const totalDuration = audiobooks.reduce((acc, b) => acc + (b.totalDuration || b.duration || 0), 0);
  const totalChapters = audiobooks.reduce((acc, b) => acc + (b.chapters?.length || 1), 0);

  // Format time
  const formatDuration = (sec: number) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins} min`;
  };

  // Audio preview toggle
  const togglePreview = (book: Audiobook) => {
    const audioUrl = book.chapters?.[0]?.audioUrl || book.coverUrl;
    if (!audioUrl) return;

    if (previewPlayingId === book.id) {
      previewAudioRef.current?.pause();
      setPreviewPlayingId(null);
    } else {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
      const audio = new Audio(audioUrl);
      previewAudioRef.current = audio;
      audio.play().catch(() => {});
      setPreviewPlayingId(book.id);
      audio.onended = () => setPreviewPlayingId(null);
    }
  };

  // Handle Edit Book
  const handleOpenEdit = (book: Audiobook) => {
    setEditingBook(book);
    setEditTitle(book.title);
    setEditAuthor(book.author);
    setEditLevel(book.level);
  };

  const handleSaveEdit = () => {
    if (!editingBook) return;
    const updated: Audiobook = {
      ...editingBook,
      title: editTitle.trim() || editingBook.title,
      author: editAuthor.trim() || editingBook.author,
      level: editLevel,
    };
    onUpdateBook(updated);
    setEditingBook(null);
  };

  // Handle Delete Book
  const handleConfirmDelete = () => {
    if (!deletingBookId) return;
    onDeleteBook(deletingBookId);
    setDeletingBookId(null);
  };

  // Handle Text File Selection in Smart Uploader
  const handleTextFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadTextFile(file);
    try {
      setProcessStatus('Extraindo texto do arquivo...');
      const extracted = await extractBookFromFile(file);
      setExtractedSentenceCount(extracted.sentences.length);
      if (!newTitle) {
        setNewTitle(extracted.title || file.name.replace(/\.[^/.]+$/, ''));
      }
      setProcessStatus(`Texto extraído: ${extracted.sentences.length} frases identificadas.`);
    } catch (err: any) {
      setProcessStatus(`Erro na leitura do texto: ${err.message || 'Falha ao ler'}`);
    }
  };

  // Handle Audio File Selection
  const handleAudioFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadAudioFile(file);
    if (!newTitle) {
      setNewTitle(file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '));
    }
  };

  // Process Smart Audio + Text Upload
  const handleProcessUpload = async () => {
    if (!uploadAudioFile) {
      alert('Selecione um arquivo de áudio (.mp3, .wav, .m4a)');
      return;
    }

    setIsProcessing(true);
    setProcessStatus('Calculando duração e sincronizando frases...');

    try {
      const audioBlobUrl = URL.createObjectURL(uploadAudioFile);

      // 1. Get real duration of the audio file
      const tempAudio = new Audio(audioBlobUrl);
      const audioDuration = await new Promise<number>((resolve) => {
        tempAudio.onloadedmetadata = () => resolve(tempAudio.duration || 120);
        tempAudio.onerror = () => resolve(120);
      });

      // 2. Extract or use text
      let sentences: string[] = [];
      if (uploadTextFile) {
        setProcessStatus('Lendo e estruturando texto do livro...');
        const extracted = await extractBookFromFile(uploadTextFile);
        sentences = extracted.sentences;
      } else if (pastedText.trim().length > 0) {
        sentences = pastedText.split(/(?<=[.?!])\s+/).map((s) => s.trim()).filter(Boolean);
      } else {
        // Placeholder speech chunks for progressive Whisper transcription as audio plays
        const chunkCount = Math.max(1, Math.ceil(audioDuration / 20));
        sentences = Array.from({ length: chunkCount }, (_, i) => {
          const sMin = Math.floor((i * 20) / 60);
          const sSec = Math.floor((i * 20) % 60);
          const eMin = Math.floor(Math.min(audioDuration, (i + 1) * 20) / 60);
          const eSec = Math.floor(Math.min(audioDuration, (i + 1) * 20) % 60);
          const timeTag = `${sMin}:${sSec.toString().padStart(2, '0')} - ${eMin}:${eSec.toString().padStart(2, '0')}`;
          return `• [${timeTag}] Trecho de áudio a ser transcrito...`;
        });
      }

      setProcessStatus(`Alinhando elasticamente ${sentences.length} frases com ${Math.round(audioDuration)}s de áudio...`);

      // 3. Elastic fuzzy alignment with difference tolerance
      const alignedSentences = alignTextToAudio(sentences, audioDuration, {
        leadInSeconds: leadInSeconds || 0.0,
      });

      const newId = `custom-${Date.now()}`;
      const finalTitle = newTitle.trim() || uploadAudioFile.name.replace(/\.[^/.]+$/, '');
      const finalAuthor = newAuthor.trim() || 'Importado pelo Usuário';

      const chapter: Chapter = {
        id: `chap-${newId}-1`,
        chapterNumber: 1,
        title: 'Capítulo 1',
        audioUrl: audioBlobUrl,
        duration: audioDuration,
        sentences: alignedSentences,
      };

      const newBook: Audiobook = {
        id: newId,
        title: finalTitle,
        author: finalAuthor,
        level: newLevel,
        duration: audioDuration,
        totalDuration: audioDuration,
        description: 'Audiolivro importado com sincronização elástica áudio + texto.',
        category: 'Estudo Personalizado',
        sentences: alignedSentences,
        coverUrl: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=800&auto=format&fit=crop&q=80',
        gradient: 'from-amber-600 via-orange-600 to-rose-700',
        chapters: [chapter],
      };

      onAddBook(newBook);
      onSelectBook(newBook);

      setIsProcessing(false);
      setShowUploadModal(false);
      if (onClose) onClose();
    } catch (err: any) {
      console.error(err);
      setIsProcessing(false);
      setProcessStatus(`Erro ao processar: ${err.message || 'Falha desconhecida'}`);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-950 p-6 text-slate-100 custom-scrollbar">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-indigo-950/80 text-indigo-400 border border-indigo-800/50">
                <FolderOpen className="w-5 h-5" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Galeria de Mídias</h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Gerencie seus audiolivros, escute prévias, sincronize áudio com texto (PDF, TXT, EPUB) ou exclua mídias.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-indigo-950/50 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Nova Mídia (Áudio + Texto)</span>
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-950/80 text-indigo-400 border border-indigo-800/40">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">Total de Obras</p>
              <p className="text-lg font-bold text-white">{audiobooks.length}</p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-950/80 text-emerald-400 border border-emerald-800/40">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">Tempo de Áudio</p>
              <p className="text-lg font-bold text-white">{formatDuration(totalDuration)}</p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center gap-3 col-span-2 sm:col-span-1">
            <div className="p-2.5 rounded-xl bg-amber-950/80 text-amber-400 border border-amber-800/40">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">Total de Capítulos</p>
              <p className="text-lg font-bold text-white">{totalChapters}</p>
            </div>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por título ou autor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900/80 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>

          <div className="flex items-center gap-1.5 self-start sm:self-auto overflow-x-auto pb-1 sm:pb-0 w-full sm:w-auto">
            {['all', 'beginner', 'intermediate', 'advanced'].map((lvl) => (
              <button
                key={lvl}
                onClick={() => setSelectedLevel(lvl)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium capitalize transition shrink-0 ${
                  selectedLevel === lvl
                    ? 'bg-indigo-600 text-white shadow'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {lvl === 'all' ? 'Todos os Níveis' : lvl}
              </button>
            ))}
          </div>
        </div>

        {/* Media Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBooks.map((book) => {
            const isCurrent = book.id === currentBookId;
            const isPlayingPreview = previewPlayingId === book.id;
            const hasMultipleChapters = (book.chapters?.length || 1) > 1;

            return (
              <div
                key={book.id}
                className={`group relative rounded-2xl bg-slate-900/70 border transition-all duration-200 overflow-hidden flex flex-col justify-between ${
                  isCurrent
                    ? 'border-indigo-500/80 shadow-xl shadow-indigo-950/40 ring-1 ring-indigo-500/50'
                    : 'border-slate-800/80 hover:border-slate-700 hover:bg-slate-900'
                }`}
              >
                {/* Book Card Top Banner */}
                <div className={`h-24 w-full bg-gradient-to-r ${book.gradient || 'from-indigo-900 to-purple-900'} p-4 relative flex items-start justify-between`}>
                  <div className="z-10">
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-black/40 text-white backdrop-blur-sm border border-white/10 uppercase tracking-wider">
                      {book.level}
                    </span>
                  </div>

                  <div className="z-10 flex items-center gap-1">
                    {/* Audio Preview Button */}
                    <button
                      onClick={() => togglePreview(book)}
                      className={`p-2 rounded-xl backdrop-blur-md transition ${
                        isPlayingPreview
                          ? 'bg-amber-500 text-slate-950 shadow-md'
                          : 'bg-black/30 text-white hover:bg-black/50'
                      }`}
                      title={isPlayingPreview ? 'Pausar prévia de áudio' : 'Ouvir prévia rápida'}
                    >
                      {isPlayingPreview ? <Pause className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div>
                    <h3 className="text-base font-bold text-white group-hover:text-indigo-300 transition line-clamp-1">
                      {book.title}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{book.author}</p>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-400 border-t border-slate-800/60 pt-2.5">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      <span>{formatDuration(book.totalDuration || book.duration || 0)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <BookOpen className="w-3.5 h-3.5 text-slate-500" />
                      <span>{book.chapters?.length || 1} cap.</span>
                    </div>
                    {book.id.startsWith('custom-') && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/40 text-emerald-300 font-mono">
                        Áudio+Texto
                      </span>
                    )}
                  </div>

                  {/* Actions Footer */}
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-800/60">
                    <button
                      onClick={() => {
                        onSelectBook(book);
                        if (onClose) onClose();
                      }}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold transition ${
                        isCurrent
                          ? 'bg-indigo-600 text-white shadow-md'
                          : 'bg-slate-800 hover:bg-indigo-600 hover:text-white text-slate-200'
                      }`}
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>{isCurrent ? 'Em Reprodução' : 'Ouvir e Estudar'}</span>
                    </button>

                    <button
                      onClick={() => handleOpenEdit(book)}
                      className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
                      title="Editar título e autor"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    {/* Delete Custom Book */}
                    {book.id.startsWith('custom-') && (
                      <button
                        onClick={() => setDeletingBookId(book.id)}
                        className="p-2 rounded-xl text-rose-400/80 hover:text-rose-300 hover:bg-rose-950/50 transition"
                        title="Excluir este audiolivro"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredBooks.length === 0 && (
          <div className="p-12 text-center rounded-2xl bg-slate-900/30 border border-slate-800 text-slate-400 space-y-2">
            <FolderOpen className="w-8 h-8 mx-auto text-slate-600" />
            <p className="text-sm font-medium">Nenhuma mídia encontrada com os filtros atuais.</p>
            <p className="text-xs text-slate-500">Tente buscar por outro termo ou clique no botão acima para importar uma nova obra.</p>
          </div>
        )}
      </div>

      {/* Edit Book Modal */}
      {editingBook && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Editar Audiolivro</h3>
              <button
                onClick={() => setEditingBook(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Título da Obra</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Autor</label>
                <input
                  type="text"
                  value={editAuthor}
                  onChange={(e) => setEditAuthor(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Nível de Dificuldade</label>
                <select
                  value={editLevel}
                  onChange={(e: any) => setEditLevel(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="Beginner">Beginner (Iniciante)</option>
                  <option value="Intermediate">Intermediate (Intermediário)</option>
                  <option value="Advanced">Advanced (Avançado)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setEditingBook(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 rounded-xl transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition shadow"
              >
                Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingBookId && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-white">Excluir Audiolivro?</h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Tem certeza que deseja remover esta mídia? Os dados sincronizados e arquivos locais associados serão excluídos.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setDeletingBookId(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 rounded-xl transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-xl transition shadow"
              >
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Smart Audio + Text Upload Wizard Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-950/80 text-indigo-400 border border-indigo-800/40">
                  <FileUp className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Novo Audiolivro (Áudio + Texto)</h3>
                  <p className="text-xs text-slate-400">
                    Sincronização elástica inteligente com tolerância a pequenas diferenças entre áudio e livro.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowUploadModal(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Step 1: Audio File Upload */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                <label className="font-semibold text-slate-300 flex items-center justify-between">
                  <span>1. Arquivo de Áudio (.mp3, .wav, .m4a, .aac) *</span>
                  {uploadAudioFile && (
                    <span className="text-[11px] text-emerald-400 font-normal">
                      ✓ {uploadAudioFile.name} ({(uploadAudioFile.size / (1024 * 1024)).toFixed(1)} MB)
                    </span>
                  )}
                </label>
                <input
                  type="file"
                  ref={audioInputRef}
                  accept="audio/*"
                  onChange={handleAudioFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => audioInputRef.current?.click()}
                  className="w-full py-3 px-4 border border-dashed border-slate-700 hover:border-indigo-500 rounded-xl text-center text-slate-400 hover:text-indigo-300 transition flex items-center justify-center gap-2"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>{uploadAudioFile ? 'Substituir Áudio Selecionado' : 'Clique para selecionar arquivo de áudio'}</span>
                </button>
              </div>

              {/* Step 2: Book Text Upload (PDF, EPUB, TXT, SRT) OR Paste */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                <label className="font-semibold text-slate-300 flex items-center justify-between">
                  <span>2. Texto do Livro (.pdf, .epub, .txt, .srt) ou Cole Abaixo</span>
                  {uploadTextFile && (
                    <span className="text-[11px] text-emerald-400 font-normal">
                      ✓ {uploadTextFile.name} ({extractedSentenceCount} frases)
                    </span>
                  )}
                </label>
                <input
                  type="file"
                  ref={textInputRef}
                  accept=".txt,.epub,.pdf,.srt,.vtt"
                  onChange={handleTextFileChange}
                  className="hidden"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => textInputRef.current?.click()}
                    className="flex-1 py-2.5 px-3 border border-dashed border-slate-700 hover:border-indigo-500 rounded-xl text-center text-slate-400 hover:text-indigo-300 transition flex items-center justify-center gap-2"
                  >
                    <FileText className="w-4 h-4" />
                    <span>{uploadTextFile ? 'Trocar Arquivo de Texto' : 'Carregar PDF, EPUB, TXT ou SRT'}</span>
                  </button>
                </div>

                <div>
                  <textarea
                    placeholder="Ou cole o texto do capítulo/livro diretamente aqui..."
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    rows={3}
                    className="w-full mt-2 bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 custom-scrollbar"
                  />
                </div>
              </div>

              {/* Step 3: Meta & Tolerance Tuning */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Título da Obra</label>
                  <input
                    type="text"
                    placeholder="Ex: Pride and Prejudice"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Autor</label>
                  <input
                    type="text"
                    placeholder="Ex: Jane Austen"
                    value={newAuthor}
                    onChange={(e) => setNewAuthor(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Nível Sugerido</label>
                  <select
                    value={newLevel}
                    onChange={(e: any) => setNewLevel(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Beginner">Beginner (A1 - A2)</option>
                    <option value="Intermediate">Intermediate (B1 - B2)</option>
                    <option value="Advanced">Advanced (C1 - C2)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 flex items-center justify-between">
                    <span>Atraso Inicial do Áudio (música/vinheta)</span>
                    <span className="font-mono text-indigo-400">{leadInSeconds.toFixed(1)}s</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    step="0.5"
                    value={leadInSeconds}
                    onChange={(e) => setLeadInSeconds(parseFloat(e.target.value))}
                    className="w-full accent-indigo-500"
                  />
                </div>
              </div>

              {processStatus && (
                <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-800/40 text-indigo-300 text-xs flex items-center gap-2">
                  <Sparkles className="w-4 h-4 animate-spin text-indigo-400 shrink-0" />
                  <span>{processStatus}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowUploadModal(false)}
                disabled={isProcessing}
                className="px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 rounded-xl transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleProcessUpload}
                disabled={isProcessing || !uploadAudioFile}
                className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl transition shadow"
              >
                <Check className="w-4 h-4" />
                <span>{isProcessing ? 'Sincronizando...' : 'Concluir e Abrir na Galeria'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
