import React, { useState, useEffect } from 'react';
import { Volume2, Check, X, Sparkles, User, Globe } from 'lucide-react';
import { audioEngine, BrowserVoice } from '../utils/audioEngine';

interface VoiceSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const VoiceSelectorModal: React.FC<VoiceSelectorModalProps> = ({ isOpen, onClose }) => {
  const [voices, setVoices] = useState<BrowserVoice[]>([]);
  const [selectedURI, setSelectedURI] = useState<string>('');
  const [testingURI, setTestingURI] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const loadVoices = () => {
      const available = audioEngine.getAvailableVoices();
      setVoices(available);
      setSelectedURI(audioEngine.getSelectedVoiceURI());
    };

    loadVoices();

    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectVoice = (voiceURI: string) => {
    setSelectedURI(voiceURI);
    audioEngine.setSelectedVoice(voiceURI);
  };

  const handleTestVoice = async (voiceURI: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTestingURI(voiceURI);
    await audioEngine.speakText('Hello! This is how I read audiobooks and pronounce vocabulary for you.', {
      voiceURI,
    });
    setTestingURI(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
      <div
        className="w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100 max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/95 sticky top-0 z-10">
          <div>
            <div className="flex items-center gap-2">
              <Volume2 className="w-5 h-5 text-indigo-400" />
              <h3 className="font-bold text-base text-white">Vozes do Navegador para Leitura & Pronúncia</h3>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Damos preferência automática para vozes <strong className="text-emerald-400">Natural</strong> do Windows/Edge/Chrome.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Voices List */}
        <div className="p-6 overflow-y-auto space-y-2.5 custom-scrollbar flex-1">
          {voices.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              Carregando vozes do navegador... Certifique-se de que o suporte de áudio está ativo.
            </div>
          ) : (
            voices.map((v) => {
              const isSelected = selectedURI === v.voiceURI;
              const isTesting = testingURI === v.voiceURI;

              return (
                <div
                  key={v.voiceURI}
                  onClick={() => handleSelectVoice(v.voiceURI)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-indigo-600/20 border-indigo-500/80 text-white shadow-md shadow-indigo-950/30'
                      : 'bg-slate-800/40 hover:bg-slate-800/80 border-slate-700/60 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        v.isNatural
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {v.isNatural ? <Sparkles className="w-4 h-4" /> : <User className="w-4 h-4" />}
                    </div>

                    <div className="overflow-hidden">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm truncate">{v.name}</span>
                        {v.isNatural && (
                          <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Natural
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400 font-mono">{v.lang}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={(e) => handleTestVoice(v.voiceURI, e)}
                      disabled={isTesting}
                      className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-indigo-950 hover:text-indigo-300 border border-slate-700 rounded-lg text-xs font-medium transition"
                      title="Testar como esta voz soa"
                    >
                      <Volume2 className={`w-3.5 h-3.5 ${isTesting ? 'animate-pulse text-indigo-400' : ''}`} />
                      <span>{isTesting ? 'Ouvindo...' : 'Testar'}</span>
                    </button>

                    {isSelected && (
                      <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white">
                        <Check className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/95 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            {voices.length} vozes em inglês encontradas no seu dispositivo
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition"
          >
            Concluir Seleção
          </button>
        </div>
      </div>
    </div>
  );
};
