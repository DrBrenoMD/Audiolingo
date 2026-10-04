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

  const initialDeck: SRSFlashcard[] = [
    {
      id: 'card-1',
      type: 'sentence',
      frontText: 'In my younger and more 【vulnerable】 years my father gave me some advice.',
      contextSentence: 'Palavra em foco: vulnerable (/ˈvʌl.nər.ə.bəl/)',
      backTranslation: 'Nos meus anos mais jovens e mais vulneráveis, meu pai me deu um conselho.',
      phonetic: '/ˈvʌl.nər.ə.bəl/',
      notes: 'Palavra chave: VULNERABLE = "vulnerável, suscetível" • The Great Gatsby',
      audiobookTitle: 'The Great Gatsby',
      dateAdded: Date.now() - 3 * 86400000,
      dueDate: Date.now() - 10000, // due now
      interval: 1,
      repetitions: 1,
      easeFactor: 2.5,
      state: 'review',
      history: [],
    },
    {
      id: 'card-2',
      type: 'sentence',
      frontText: 'Whenever you 【feel like】 criticizing anyone, just remember that all the people in this world haven’t had the advantages that you’ve had.',
      contextSentence: 'Expressão em foco: feel like (sentir vontade de)',
      backTranslation: 'Sempre que você sentir vontade de criticar alguém, apenas lembre-se de que nem todas as pessoas neste mundo tiveram as vantagens que você teve.',
      phonetic: '/fiːl laɪk/',
      notes: 'Expressão: FEEL LIKE + ING = "sentir vontade de fazer algo" • The Great Gatsby',
      audiobookTitle: 'The Great Gatsby',
      dateAdded: Date.now() - 2 * 86400000,
      dueDate: Date.now() - 5000,
      interval: 1,
      repetitions: 0,
      easeFactor: 2.5,
      state: 'new',
      history: [],
    },
    {
      id: 'card-3',
      type: 'sentence',
      frontText: 'You can’t connect the dots looking forward; you can only connect them looking 【backward】.',
      contextSentence: 'Palavra em foco: backward (/ˈbæk.wɚd/)',
      backTranslation: 'Você não consegue ligar os pontos olhando para frente; você só consegue ligá-los olhando para trás.',
      phonetic: '/ˈbæk.wɚd/',
      notes: 'Palavra chave: BACKWARD = "para trás, em retrospectiva" • Steve Jobs Stanford Speech',
      audiobookTitle: 'Stay Hungry, Stay Foolish',
      dateAdded: Date.now() - 86400000,
      dueDate: Date.now() - 2000,
      interval: 1,
      repetitions: 0,
      easeFactor: 2.5,
      state: 'new',
      history: [],
    },
  ];

  localStorage.setItem(STORAGE_KEY, JSON.stringify(initialDeck));
  return initialDeck;
}

export function saveFlashcardsToStorage(cards: SRSFlashcard[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
}
