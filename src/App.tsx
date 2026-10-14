import React, { useState, useEffect } from 'react';
import { Audiobook, SRSFlashcard, UserStats } from './types';
import { getInitialFlashcards, saveFlashcardsToStorage } from './utils/srs';
import { isPlaceholderSentence } from './utils/fuzzyAligner';
import { getAudioBlobUrl } from './utils/audioStorage';
import { Navbar, NavTab } from './components/Navbar';
import { AudiobookPlayer } from './components/AudiobookPlayer';
import { MediaManager } from './components/MediaManager';
import { SpeakingLab } from './components/SpeakingLab';
import { ListeningLab } from './components/ListeningLab';
import { WritingLab } from './components/WritingLab';
import { SRSFlashcards } from './components/SRSFlashcards';
import { ProgressDashboard } from './components/ProgressDashboard';

const STATS_KEY = 'echolingo_stats_data';
const BOOKS_KEY = 'echolingo_custom_books';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('media');
  const [audiobooks, setAudiobooks] = useState<Audiobook[]>(() => {
    const saved = localStorage.getItem(BOOKS_KEY);
    if (saved) {
      try {
        const custom: Audiobook[] = JSON.parse(saved);
        // Delete and filter out all example/sample/demo audiobooks
        const userBooks = custom.filter(
          (b) =>
            !b.id.startsWith('demo') &&
            !b.id.startsWith('sample') &&
            !b.id.startsWith('example') &&
            !b.id.startsWith('default')
        );
        // Sync filtered storage
        if (userBooks.length !== custom.length) {
          localStorage.setItem(BOOKS_KEY, JSON.stringify(userBooks));
        }
        const normalized = userBooks.map((b) => ({
          ...b,
          sentences: (b.sentences || []).map((s) =>
            isPlaceholderSentence(s) ? { ...s, words: [] } : s
          ),
          chapters: b.chapters?.map((c) => ({
            ...c,
            sentences: (c.sentences || []).map((s) =>
              isPlaceholderSentence(s) ? { ...s, words: [] } : s
            ),
          })),
        }));
        return normalized;
      } catch (e) {
        console.error(e);
      }
    }
    return [];
  });

  const [selectedAudiobook, setSelectedAudiobook] = useState<Audiobook | null>(() => audiobooks[0] || null);
  const [cards, setCards] = useState<SRSFlashcard[]>(() => getInitialFlashcards());
  const [speakingSentence, setSpeakingSentence] = useState<string>('');

  // User Stats
  const [stats, setStats] = useState<UserStats>(() => {
    const saved = localStorage.getItem(STATS_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return {
      listeningSeconds: 1200,
      wordsReviewedCount: 14,
      cardsMasteredCount: 3,
      speakingAttemptsCount: 5,
      writingExercisesCount: 2,
      currentStreak: 5,
      lastActiveDate: new Date().toISOString().split('T')[0],
    };
  });

  // Save cards to storage on change
  useEffect(() => {
    saveFlashcardsToStorage(cards);
  }, [cards]);

  // Save stats to storage on change
  useEffect(() => {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  }, [stats]);

  // Auto-restore custom audio blob URLs from IndexedDB for persistent gallery playback
  useEffect(() => {
    if (selectedAudiobook?.id?.startsWith('custom-')) {
      const bookId = selectedAudiobook.id;
      getAudioBlobUrl(bookId, selectedAudiobook.audioUrl).then(async (restoredUrl) => {
        let updatedChapters = selectedAudiobook.chapters;
        if (updatedChapters && updatedChapters.length > 0) {
          updatedChapters = await Promise.all(
            updatedChapters.map(async (ch, idx) => {
              if (idx === 0 && restoredUrl) {
                return { ...ch, audioUrl: restoredUrl };
              }
              const chUrl = await getAudioBlobUrl(ch.id, ch.audioUrl);
              return chUrl ? { ...ch, audioUrl: chUrl } : ch;
            })
          );
        }

        setSelectedAudiobook((prev) =>
          prev && prev.id === bookId
            ? {
                ...prev,
                audioUrl: restoredUrl || prev.audioUrl,
                chapters: updatedChapters || prev.chapters,
              }
            : prev
        );
      });
    }
  }, [selectedAudiobook?.id]);

  // Handle saving to SRS deck (always preserves full sentence for sentence mining!)
  const handleSaveToSRS = (newCardData: Partial<SRSFlashcard>) => {
    const newCard: SRSFlashcard = {
      id: `card-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type: 'sentence', // Full sentence mining
      frontText: newCardData.frontText || '',
      contextSentence: newCardData.contextSentence,
      backTranslation: newCardData.backTranslation || '',
      phonetic: newCardData.phonetic,
      notes: newCardData.notes,
      audiobookTitle: newCardData.audiobookTitle || selectedAudiobook?.title || 'Audiolivro',
      dateAdded: Date.now(),
      dueDate: Date.now(),
      interval: 1,
      repetitions: 0,
      easeFactor: 2.5,
      state: 'new',
      history: [],
    };

    setCards((prev) => [newCard, ...prev]);
  };

  const handleUpdateCard = (updated: SRSFlashcard) => {
    setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setStats((prev) => ({
      ...prev,
      wordsReviewedCount: prev.wordsReviewedCount + 1,
    }));
  };

  const handleDeleteCard = (id: string) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
  };

  const handleAudiobookCreated = (newBook: Audiobook) => {
    setAudiobooks((prev) => {
      const updated = [newBook, ...prev];
      const customOnly = updated.filter((b) => b.id.startsWith('custom-'));
      localStorage.setItem(BOOKS_KEY, JSON.stringify(customOnly));
      return updated;
    });
    setSelectedAudiobook(newBook);
    setActiveTab('player');
  };

  const handleUpdateAudiobook = (updated: Audiobook) => {
    setAudiobooks((prev) => {
      const next = prev.map((b) => (b.id === updated.id ? updated : b));
      localStorage.setItem(BOOKS_KEY, JSON.stringify(next));
      return next;
    });
    if (selectedAudiobook?.id === updated.id) {
      setSelectedAudiobook(updated);
    }
  };

  const handleDeleteAudiobook = (bookId: string) => {
    setAudiobooks((prev) => {
      const next = prev.filter((b) => b.id !== bookId);
      localStorage.setItem(BOOKS_KEY, JSON.stringify(next));
      if (selectedAudiobook?.id === bookId) {
        setSelectedAudiobook(next[0] || null);
      }
      return next;
    });
  };

  const handleNavigateToSpeaking = (sentence: string) => {
    setSpeakingSentence(sentence);
    setActiveTab('speaking');
  };

  const dueCardsCount = cards.filter((c) => c.dueDate <= Date.now()).length;

  return (
    <div className="h-screen overflow-hidden bg-slate-950 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        dueCardsCount={dueCardsCount}
        streak={stats.currentStreak}
        onOpenUpload={() => {
          setActiveTab('media');
        }}
      />

      {/* Main View Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {activeTab === 'player' && (
          <AudiobookPlayer
            audiobook={selectedAudiobook}
            onSaveToSRS={handleSaveToSRS}
            onNavigateToSpeaking={handleNavigateToSpeaking}
            onSelectAudiobook={(b) => setSelectedAudiobook(b)}
            allAudiobooks={audiobooks}
            onAudiobookCreated={handleAudiobookCreated}
            onUpdateAudiobook={handleUpdateAudiobook}
            onOpenMediaGallery={() => setActiveTab('media')}
          />
        )}

        {activeTab === 'media' && (
          <MediaManager
            audiobooks={audiobooks}
            currentBookId={selectedAudiobook?.id || ''}
            onSelectBook={(b) => {
              setSelectedAudiobook(b);
              setActiveTab('player');
            }}
            onUpdateBook={handleUpdateAudiobook}
            onDeleteBook={handleDeleteAudiobook}
            onAddBook={handleAudiobookCreated}
            onClose={() => setActiveTab('player')}
          />
        )}

        {activeTab === 'speaking' && (
          <SpeakingLab
            currentAudiobook={selectedAudiobook}
            initialSentence={speakingSentence}
            onRecordAttempt={() => {
              setStats((prev) => ({
                ...prev,
                speakingAttemptsCount: prev.speakingAttemptsCount + 1,
              }));
            }}
          />
        )}

        {activeTab === 'listening' && (
          <ListeningLab currentAudiobook={selectedAudiobook} />
        )}

        {activeTab === 'writing' && (
          <WritingLab
            currentAudiobook={selectedAudiobook}
            onRecordWriting={() => {
              setStats((prev) => ({
                ...prev,
                writingExercisesCount: prev.writingExercisesCount + 1,
              }));
            }}
          />
        )}

        {activeTab === 'srs' && (
          <SRSFlashcards
            cards={cards}
            onUpdateCard={handleUpdateCard}
            onDeleteCard={handleDeleteCard}
          />
        )}

        {activeTab === 'dashboard' && (
          <ProgressDashboard
            stats={stats}
            cards={cards}
            allAudiobooks={audiobooks}
          />
        )}
      </main>
    </div>
  );
}
