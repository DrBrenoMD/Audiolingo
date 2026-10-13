import { SRSFlashcard, SRSState } from '../types';

const STORAGE_KEY = 'echolingo_srs_flashcards';
const STATS_STORAGE_KEY = 'echolingo_user_stats';

// SuperMemo SM-2 algorithm implementation
export function calculateNextSRS(
  card: SRSFlashcard,
  rating: number // 1: Again (0), 2: Hard (3), 3: Good (4), 4: Easy (5)
): { interval: number; repetitions: number; easeFactor: number; dueDate: number; state: SRSState } {
  let { interval, repetitions, easeFactor } = card;

  // Rating maps:
  // 1 = Again (failed) -> score 1
  // 2 = Hard -> score 3
  // 3 = Good -> score 4
  // 4 = Easy -> score 5
  let q = 1;
  if (rating === 2) q = 3;
  if (rating === 3) q = 4;
  if (rating === 4) q = 5;

  // New ease factor
  easeFactor = easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (easeFactor < 1.3) easeFactor = 1.3;

  let state: SRSState = card.state;

  if (rating === 1) {
    // Again: reset interval
    repetitions = 0;
    interval = 1; // 1 day or 10 min
    state = 'learning';
  } else {
    // Successful recall
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    repetitions += 1;

    if (repetitions >= 4 && interval >= 21) {
      state = 'mastered';
    } else {
      state = 'review';
    }
  }

  // Bonus for Easy
  if (rating === 4) {
    interval = Math.round(interval * 1.3);
  }

  const dueDate = Date.now() + interval * 24 * 60 * 60 * 1000;

  return {
    interval,
    repetitions,
    easeFactor,
    dueDate,
    state,
  };
}

// Initial flashcards generator
export function getInitialFlashcards(): SRSFlashcard[] {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to parse saved flashcards', e);
    }
  }

  return [];
}

export function saveFlashcardsToStorage(cards: SRSFlashcard[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
}
