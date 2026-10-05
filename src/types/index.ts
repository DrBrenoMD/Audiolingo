export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export interface WordCue {
  word: string;
  cleanWord: string;
  start: number; // in seconds
  end: number;   // in seconds
  index: number;
}

export interface Sentence {
  id: string;
  index: number;
  start: number;
  end: number;
  text: string;
  translationPt: string;
  words: WordCue[];
}

export interface Chapter {
  id: string;
  chapterNumber: number;
  title: string;
  fileName?: string;
  audioUrl?: string;
  audioBlob?: string; // base64 or blob url
  duration: number; // in seconds
  sentences: Sentence[];
  summaryPt?: string;
  status?: 'ready' | 'processing' | 'pending';
}

export interface Audiobook {
  id: string;
  title: string;
  author: string;
  coverUrl: string;
  audioUrl?: string;
  audioBlob?: string; // base64 or blob url
  duration: number; // in seconds
  totalDuration?: number; // in seconds
  gradient?: string;
  description: string;
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  category: string;
  sentences: Sentence[];
  summaryPt?: string;
  chapters?: Chapter[];
  currentChapterIndex?: number;
}

export interface WordDefinition {
  pos: string;
  englishDef: string;
  portugueseDef: string;
}

export interface ExampleSentence {
  en: string;
  pt: string;
}

export interface WordLookupResult {
  word: string;
  phonetic: string;
  phoneticIpa?: string;
  audioUrl?: string;
  source?: 'traditional_api' | 'ai' | 'traditional-dictionary-fast' | 'instant-memory-dictionary' | string;
  partOfSpeech: string;
  cefrLevel: CEFRLevel;
  contextualTranslation?: string;
  translationPt?: string;
  contextualExplanation: string;
  definitions: WordDefinition[];
  synonyms: string[];
  antonyms: string[];
  collocations: string[];
  examples: ExampleSentence[];
  grammarNotes?: string;
}

export interface GrammarStructure {
  name: string;
  element: string;
  explanationPt: string;
  alternativeExamples: string[];
}

export interface GrammarExplanationResult {
  sentence: string;
  translationPt: string;
  mainTense: string;
  structures: GrammarStructure[];
  keyVocabulary: Array<{ term: string; meaningPt: string; cefr: string }>;
  culturalOrIdiomaticNuance?: string;
}

export type SRSState = 'new' | 'learning' | 'review' | 'mastered';

export interface SRSFlashcard {
  id: string;
  type: 'word' | 'sentence';
  frontText: string;
  contextSentence?: string;
  backTranslation: string;
  phonetic?: string;
  notes?: string;
  audiobookTitle?: string;
  dateAdded: number;
  dueDate: number; // timestamp
  interval: number; // in days
  repetitions: number;
  easeFactor: number; // default 2.5
  state: SRSState;
  history: Array<{
    reviewedAt: number;
    rating: number; // 1: Again, 2: Hard, 3: Good, 4: Easy
    interval: number;
  }>;
}

export interface SpeakingWordEvaluation {
  word: string;
  status: 'good' | 'average' | 'poor';
  tip?: string;
}

export interface SpeakingEvaluationResult {
  overallScore: number;
  fluencyScore: number;
  accuracyScore: number;
  recognizedText?: string;
  wordAnalysis: SpeakingWordEvaluation[];
  positiveFeedbackPt: string;
  improvementTipsPt: string;
  phonemeFocus: string[];
}

export interface ListeningChallenge {
  id: string;
  type: 'dictation' | 'comprehension' | 'vocabulary_in_context';
  targetSentence: string;
  question: string;
  maskedSentence?: string;
  correctAnswer: string;
  options?: string[];
  explanationPt: string;
  audioTimeHint?: string;
}

export interface WritingCorrection {
  original: string;
  corrected: string;
  explanationPt: string;
  type: 'grammar' | 'spelling' | 'punctuation' | 'word_choice';
}

export interface VocabularyUpgrade {
  original: string;
  suggested: string;
  reasonPt: string;
}

export interface WritingEvaluationResult {
  score: number;
  estimatedCefrLevel: CEFRLevel;
  summaryFeedbackPt: string;
  strengthsPt: string[];
  corrections: WritingCorrection[];
  vocabularyUpgrades: VocabularyUpgrade[];
  nativeVersion: string;
}

export interface UserStats {
  listeningSeconds: number;
  wordsReviewedCount: number;
  cardsMasteredCount: number;
  speakingAttemptsCount: number;
  writingExercisesCount: number;
  currentStreak: number;
  lastActiveDate: string; // YYYY-MM-DD
}
