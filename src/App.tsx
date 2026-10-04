import React, { useState, useEffect } from 'react';
import { sampleAudiobooks } from './data/sampleAudiobooks';
import { Audiobook, SRSFlashcard, UserStats } from './types';
import { getInitialFlashcards, saveFlashcardsToStorage } from './utils/srs';
import { Navbar, NavTab } from './components/Navbar';
import { AudiobookPlayer } from './components/AudiobookPlayer';
import { WordInspectorModal } from './components/WordInspectorModal';
import { GrammarExplainerModal } from './components/GrammarExplainerModal';
import { SpeakingLab } from './components/SpeakingLab';
import { ListeningLab } from './components/ListeningLab';
import { WritingLab } from './components/WritingLab';
import { SRSFlashcards } from './components/SRSFlashcards';
import { ProgressDashboard } from './components/ProgressDashboard';
import { UploadModal } from './components/UploadModal';

const STATS_KEY = 'echolingo_stats_data';
const BOOKS_KEY = 'echolingo_custom_books';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('player');
  const [audiobooks, setAudiobooks] = useState<Audiobook[]>(() => {
    const saved = localStorage.getItem(BOOKS_KEY);
    if (saved) {
      try {
        const custom = JSON.parse(saved);
        return [...sampleAudiobooks, ...custom];
      } catch (e) {
        console.error(e);
      }
    }
    return sampleAudiobooks;
  });

  const [selectedAudiobook, setSelectedAudiobook] = useState<Audiobook>(audiobooks[0]);
  const [cards, setCards] = useState<SRSFlashcard[]>(() => getInitialFlashcards());

  // Modals state
  const [inspectWord, setInspectWord] = useState<string | null>(null);
  const [inspectSentence, setInspectSentence] = useState<string>('');
  const [grammarSentence, setGrammarSentence] = useState<string | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
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

  // Handle saving word or sentence to SRS deck
  const handleSaveToSRS = (newCardData: Partial<SRSFlashcard>) => {
    const newCard: SRSFlashcard = {
      id: `card-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type: newCardData.type || 'word',
      frontText: newCardData.frontText || '',
      contextSentence: newCardData.contextSentence,
      backTranslation: newCardData.backTranslation || '',
      phonetic: newCardData.phonetic,
      notes: newCardData.notes,
      audiobookTitle: newCardData.audiobookTitle || selectedAudiobook.title,
      dateAdded: Date.now(),
      dueDate: Date.now(), // available for review
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
      // Save custom books
      const customOnly = updated.filter((b) => b.id.startsWith('custom-'));
      localStorage.setItem(BOOKS_KEY, JSON.stringify(customOnly));
      return updated;
    });
    setSelectedAudiobook(newBook);
    setActiveTab('player');
  };

  const handleNavigateToSpeaking = (sentence: string) => {
    setSpeakingSentence(sentence);
    setActiveTab('speaking');
  };

  const dueCardsCount = cards.filter((c) => c.dueDate <= Date.now()).length;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        dueCardsCount={dueCardsCount}
        streak={stats.currentStreak}
        onOpenUpload={() => setIsUploadOpen(true)}
      />

      {/* Main View Area */}
      <main className="flex-1 flex flex-col">
        {activeTab === 'player' && (
          <AudiobookPlayer
            audiobook={selectedAudiobook}
            onExplainGrammar={(sentence) => setGrammarSentence(sentence)}
            onSaveToSRS={handleSaveToSRS}
            onNavigateToSpeaking={handleNavigateToSpeaking}
            onSelectAudiobook={(b) => setSelectedAudiobook(b)}
            allAudiobooks={audiobooks}
            onOpenUpload={() => setIsUploadOpen(true)}
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

      {/* Sentence Grammar Modal */}
      {grammarSentence && (
        <GrammarExplainerModal
          sentence={grammarSentence}
          bookTitle={selectedAudiobook.title}
          isOpen={Boolean(grammarSentence)}
          onClose={() => setGrammarSentence(null)}
          onSaveToSRS={handleSaveToSRS}
        />
      )}

      {/* Upload Custom Audiobook Modal */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onAudiobookCreated={handleAudiobookCreated}
      />
    </div>
  );
}
