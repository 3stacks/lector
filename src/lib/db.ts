import Dexie, { type EntityTable } from 'dexie';

// ============================================================================
// Type Definitions
// ============================================================================

export type WordState = 'new' | 'level1' | 'level2' | 'level3' | 'level4' | 'known' | 'ignored';
export type VocabType = 'word' | 'phrase';
export type ClozeMasteryLevel = 0 | 25 | 50 | 75 | 100;
export type ClozeSource = 'tatoeba' | 'mined';
export type ClozeCollection = 'top500' | 'top1000' | 'top2000' | 'mined' | 'random';

export interface BookProgress {
  chapter: number;
  scrollPosition: number;
  percentComplete: number;
}

export type BookFileType = 'epub' | 'pdf' | 'markdown';

export interface Book {
  id: string;
  title: string;
  author: string;
  coverUrl?: string;
  fileData: ArrayBuffer;
  fileType: BookFileType;
  progress: BookProgress;
  createdAt: Date;
  lastReadAt: Date;
  // For markdown, store the raw text for easier access
  textContent?: string;
}

export interface ReadingPosition {
  bookId: string;
  cfi: string; // epub.js CFI location string
  chapter: number;
  percentage: number;
  updatedAt: Date;
}

export interface VocabEntry {
  id: string;
  text: string;
  type: VocabType;
  sentence: string;
  translation: string;
  state: WordState;
  stateUpdatedAt: Date;
  reviewCount: number;
  bookId?: string;
  chapter?: number;
  createdAt: Date;
  pushedToAnki: boolean;
  ankiNoteId?: number;
}

export interface KnownWord {
  word: string;  // lowercase, normalized - primary key
  state: WordState;
}

export interface ClozeSentence {
  id: string;
  sentence: string;
  clozeWord: string;
  clozeIndex: number;
  translation: string;
  source: ClozeSource;
  collection: ClozeCollection;
  wordRank?: number;  // Frequency rank of cloze word (1-2000, undefined if not in dictionary)
  tatoebaSentenceId?: number;
  vocabEntryId?: string;  // Link to vocab entry if mined
  masteryLevel: ClozeMasteryLevel;
  nextReview: Date;
  reviewCount: number;
  lastReviewed?: Date;
  timesCorrect: number;
  timesIncorrect: number;
}

export interface DailyStats {
  date: string;  // YYYY-MM-DD, primary key
  wordsRead: number;
  newWordsSaved: number;
  wordsMarkedKnown: number;
  minutesRead: number;
  clozePracticed: number;
  points: number;
  dictionaryLookups: number;
}

export interface Settings {
  key: string;  // primary key
  value: unknown;
}

// ============================================================================
// Database Class
// ============================================================================

class AfrikaansLearningDB extends Dexie {
  books!: EntityTable<Book, 'id'>;
  vocab!: EntityTable<VocabEntry, 'id'>;
  knownWords!: EntityTable<KnownWord, 'word'>;
  clozeSentences!: EntityTable<ClozeSentence, 'id'>;
  dailyStats!: EntityTable<DailyStats, 'date'>;
  settings!: EntityTable<Settings, 'key'>;

  constructor() {
    super('AfrikaansLearningDB');

    this.version(1).stores({
      // Books: indexed by id, with indexes on title, author, lastReadAt for sorting
      books: 'id, title, author, lastReadAt',

      // Vocab: indexed by id, with indexes for lookups and filtering
      vocab: 'id, text, type, state, stateUpdatedAt, bookId, createdAt, pushedToAnki, [bookId+chapter]',

      // KnownWords: fast lookup table, indexed by normalized word
      knownWords: 'word, state',

      // ClozeSentences: indexed for review scheduling and collections
      clozeSentences: 'id, clozeWord, source, collection, wordRank, masteryLevel, nextReview, tatoebaSentenceId',

      // DailyStats: indexed by date (primary key)
      dailyStats: 'date',

      // Settings: simple key-value store
      settings: 'key'
    });
  }
}

// Create and export the database instance
export const db = new AfrikaansLearningDB();

// ============================================================================
// Helper Functions - Books
// ============================================================================

export async function getBook(id: string): Promise<Book | undefined> {
  const book = await db.books.get(id);
  if (!book) return undefined;

  // Migration: handle old books with epubData field
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const oldBook = book as any;
  if (oldBook.epubData && !book.fileData) {
    book.fileData = oldBook.epubData;
    book.fileType = 'epub';
    // Save migration
    await db.books.put(book);
  }

  // Ensure fileType defaults to epub for old entries
  if (!book.fileType) {
    book.fileType = 'epub';
  }

  return book;
}

export async function getAllBooks(): Promise<Book[]> {
  const books = await db.books.orderBy('lastReadAt').reverse().toArray();

  // Migration: handle old books with epubData field
  for (const book of books) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const oldBook = book as any;
    if (oldBook.epubData && !book.fileData) {
      book.fileData = oldBook.epubData;
      book.fileType = 'epub';
      await db.books.put(book);
    }
    if (!book.fileType) {
      book.fileType = 'epub';
    }
  }

  return books;
}

export async function saveBook(book: Book): Promise<string> {
  return db.books.put(book);
}

export async function deleteBook(id: string): Promise<void> {
  await db.books.delete(id);
}

export async function updateBookProgress(
  id: string,
  progress: BookProgress
): Promise<number> {
  return db.books.update(id, {
    progress,
    lastReadAt: new Date()
  });
}

export async function saveReadingPosition(
  bookId: string,
  cfi: string,
  chapter: number,
  percentage: number
): Promise<void> {
  await db.books.update(bookId, {
    progress: {
      chapter,
      scrollPosition: 0, // Not used with CFI-based navigation
      percentComplete: percentage
    },
    lastReadAt: new Date()
  });
  // Also store the CFI in settings for more precise restoration
  await setSetting(`reading-position-${bookId}`, {
    cfi,
    chapter,
    percentage,
    updatedAt: new Date().toISOString()
  });
}

export async function getReadingPosition(bookId: string): Promise<{
  cfi: string;
  chapter: number;
  percentage: number;
} | null> {
  const position = await getSetting<{
    cfi: string;
    chapter: number;
    percentage: number;
    updatedAt: string;
  }>(`reading-position-${bookId}`);
  return position || null;
}

// ============================================================================
// Helper Functions - Vocabulary
// ============================================================================

export async function getVocabEntry(id: string): Promise<VocabEntry | undefined> {
  return db.vocab.get(id);
}

export async function getVocabByText(text: string): Promise<VocabEntry | undefined> {
  return db.vocab.where('text').equals(text).first();
}

export async function saveVocab(entry: VocabEntry): Promise<string> {
  // Also update the knownWords lookup table
  await db.knownWords.put({
    word: entry.text.toLowerCase(),
    state: entry.state
  });
  return db.vocab.put(entry);
}

export async function updateVocabState(
  id: string,
  state: WordState
): Promise<void> {
  const entry = await db.vocab.get(id);
  if (entry) {
    await db.vocab.update(id, {
      state,
      stateUpdatedAt: new Date()
    });
    await db.knownWords.put({
      word: entry.text.toLowerCase(),
      state
    });
  }
}

export async function getVocabByState(state: WordState): Promise<VocabEntry[]> {
  return db.vocab.where('state').equals(state).toArray();
}

export async function getVocabForBook(bookId: string): Promise<VocabEntry[]> {
  return db.vocab.where('bookId').equals(bookId).toArray();
}

export async function getUnpushedVocab(): Promise<VocabEntry[]> {
  return db.vocab.filter(v => v.pushedToAnki === false).toArray();
}

export async function markVocabPushedToAnki(
  id: string,
  ankiNoteId: number
): Promise<number> {
  return db.vocab.update(id, {
    pushedToAnki: true,
    ankiNoteId
  });
}

export async function deleteVocabEntry(id: string): Promise<void> {
  const entry = await db.vocab.get(id);
  if (entry) {
    await db.vocab.delete(id);
    // Check if there are other entries with the same word before removing from knownWords
    const otherEntries = await db.vocab.where('text').equals(entry.text).count();
    if (otherEntries === 0) {
      await db.knownWords.delete(entry.text.toLowerCase());
    }
  }
}

// ============================================================================
// Helper Functions - Known Words (Fast Lookup)
// ============================================================================

export async function getWordState(word: string): Promise<WordState | undefined> {
  const entry = await db.knownWords.get(word.toLowerCase());
  return entry?.state;
}

export async function updateWordState(
  word: string,
  state: WordState
): Promise<void> {
  await db.knownWords.put({
    word: word.toLowerCase(),
    state
  });
}

export async function getKnownWordsMap(): Promise<Map<string, WordState>> {
  const entries = await db.knownWords.toArray();
  return new Map(entries.map(e => [e.word, e.state]));
}

export async function bulkUpdateWordStates(
  updates: Array<{ word: string; state: WordState }>
): Promise<void> {
  const entries = updates.map(u => ({
    word: u.word.toLowerCase(),
    state: u.state
  }));
  await db.knownWords.bulkPut(entries);
}

// ============================================================================
// Helper Functions - Cloze Sentences
// ============================================================================

export async function getClozeSentence(id: string): Promise<ClozeSentence | undefined> {
  return db.clozeSentences.get(id);
}

export async function saveClozeSentence(sentence: ClozeSentence): Promise<string> {
  return db.clozeSentences.put(sentence);
}

export async function getClozeSentencesDueForReview(limit: number = 20): Promise<ClozeSentence[]> {
  const now = new Date();
  return db.clozeSentences
    .where('nextReview')
    .belowOrEqual(now)
    .limit(limit)
    .toArray();
}

export async function updateClozeAfterReview(
  id: string,
  correct: boolean,
  newMasteryLevel: ClozeMasteryLevel,
  nextReview: Date
): Promise<number> {
  const sentence = await db.clozeSentences.get(id);
  if (!sentence) return 0;

  return db.clozeSentences.update(id, {
    masteryLevel: newMasteryLevel,
    nextReview,
    reviewCount: sentence.reviewCount + 1,
    lastReviewed: new Date(),
    timesCorrect: sentence.timesCorrect + (correct ? 1 : 0),
    timesIncorrect: sentence.timesIncorrect + (correct ? 0 : 1)
  });
}

export async function getClozeSentencesForWord(word: string): Promise<ClozeSentence[]> {
  return db.clozeSentences.where('clozeWord').equals(word).toArray();
}

export async function bulkSaveClozeSentences(sentences: ClozeSentence[]): Promise<void> {
  await db.clozeSentences.bulkPut(sentences);
}

/**
 * Migrate existing cloze sentences to add collection field
 * Call this on app startup to ensure all sentences have collections
 */
export async function migrateClozeSentences(): Promise<number> {
  // Import here to avoid circular dependency
  const { lookupWord } = await import('./dictionary');

  const allSentences = await db.clozeSentences.toArray();
  let migratedCount = 0;

  for (const sentence of allSentences) {
    // Skip if already has collection
    if (sentence.collection) continue;

    // Look up the cloze word to get its rank
    const entry = lookupWord(sentence.clozeWord);
    const rank = entry?.rank;

    // Determine collection based on rank
    let collection: ClozeCollection;
    if (rank === undefined) {
      collection = 'random';
    } else if (rank <= 500) {
      collection = 'top500';
    } else if (rank <= 1000) {
      collection = 'top1000';
    } else if (rank <= 2000) {
      collection = 'top2000';
    } else {
      collection = 'random';
    }

    // Update the sentence
    await db.clozeSentences.update(sentence.id, {
      collection,
      wordRank: rank,
    });
    migratedCount++;
  }

  return migratedCount;
}

/**
 * Get sentences due for review from a specific collection
 * Implements anti-clumping by excluding recently used cloze words
 */
export async function getClozeSentencesByCollection(
  collection: ClozeCollection,
  limit: number = 20,
  excludeWords: string[] = []
): Promise<ClozeSentence[]> {
  const now = new Date();
  const excludeSet = new Set(excludeWords.map(w => w.toLowerCase()));

  // Get due sentences from this collection
  let sentences = await db.clozeSentences
    .where('collection')
    .equals(collection)
    .filter(s => s.nextReview <= now)
    .toArray();

  // Filter out recently used words
  if (excludeSet.size > 0) {
    sentences = sentences.filter(s => !excludeSet.has(s.clozeWord.toLowerCase()));
  }

  // Sort by nextReview date (oldest first) and wordRank (rarer words first for variety)
  sentences.sort((a, b) => {
    const dateDiff = a.nextReview.getTime() - b.nextReview.getTime();
    if (dateDiff !== 0) return dateDiff;
    // If same review date, prefer rarer words (higher rank = rarer = more priority)
    return (b.wordRank || 2001) - (a.wordRank || 2001);
  });

  return sentences.slice(0, limit);
}

/**
 * Get new (unreviewed) sentences from a collection
 */
export async function getNewSentencesByCollection(
  collection: ClozeCollection,
  limit: number = 20,
  excludeWords: string[] = []
): Promise<ClozeSentence[]> {
  const excludeSet = new Set(excludeWords.map(w => w.toLowerCase()));

  let sentences = await db.clozeSentences
    .where('collection')
    .equals(collection)
    .filter(s => s.reviewCount === 0)
    .toArray();

  // Filter out recently used words
  if (excludeSet.size > 0) {
    sentences = sentences.filter(s => !excludeSet.has(s.clozeWord.toLowerCase()));
  }

  // Sort by word rank (rarer words first, but mix it up)
  sentences.sort((a, b) => (a.wordRank || 2001) - (b.wordRank || 2001));

  return sentences.slice(0, limit);
}

/**
 * Get count of sentences by collection
 */
export async function getCollectionCounts(): Promise<Record<ClozeCollection, { total: number; due: number; mastered: number }>> {
  const now = new Date();
  const collections: ClozeCollection[] = ['top500', 'top1000', 'top2000', 'mined', 'random'];

  const counts: Record<ClozeCollection, { total: number; due: number; mastered: number }> = {
    top500: { total: 0, due: 0, mastered: 0 },
    top1000: { total: 0, due: 0, mastered: 0 },
    top2000: { total: 0, due: 0, mastered: 0 },
    mined: { total: 0, due: 0, mastered: 0 },
    random: { total: 0, due: 0, mastered: 0 },
  };

  for (const collection of collections) {
    const sentences = await db.clozeSentences
      .where('collection')
      .equals(collection)
      .toArray();

    counts[collection].total = sentences.length;
    counts[collection].due = sentences.filter(s => s.nextReview <= now && s.reviewCount > 0 && s.masteryLevel < 100).length;
    counts[collection].mastered = sentences.filter(s => s.masteryLevel === 100).length;
  }

  return counts;
}

// ============================================================================
// Helper Functions - Daily Stats
// ============================================================================

function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0];
}

export async function getDailyStats(date: string): Promise<DailyStats | undefined> {
  return db.dailyStats.get(date);
}

export async function getTodayStats(): Promise<DailyStats> {
  const today = getTodayDateString();
  let stats = await db.dailyStats.get(today);

  if (!stats) {
    stats = {
      date: today,
      wordsRead: 0,
      newWordsSaved: 0,
      wordsMarkedKnown: 0,
      minutesRead: 0,
      clozePracticed: 0,
      points: 0,
      dictionaryLookups: 0
    };
    await db.dailyStats.put(stats);
  }

  return stats;
}

export async function incrementDailyStat(
  field: keyof Omit<DailyStats, 'date'>,
  amount: number = 1
): Promise<void> {
  const stats = await getTodayStats();
  await db.dailyStats.update(stats.date, {
    [field]: stats[field] + amount
  });
}

export async function getStatsForDateRange(
  startDate: string,
  endDate: string
): Promise<DailyStats[]> {
  return db.dailyStats
    .where('date')
    .between(startDate, endDate, true, true)
    .toArray();
}

export async function getRecentStats(days: number = 7): Promise<DailyStats[]> {
  const endDate = getTodayDateString();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days + 1);
  const startDateStr = startDate.toISOString().split('T')[0];

  return getStatsForDateRange(startDateStr, endDate);
}

// ============================================================================
// Helper Functions - Settings
// ============================================================================

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const setting = await db.settings.get(key);
  return setting?.value as T | undefined;
}

export async function setSetting<T>(key: string, value: T): Promise<string> {
  return db.settings.put({ key, value });
}

export async function deleteSetting(key: string): Promise<void> {
  await db.settings.delete(key);
}

export async function getAllSettings(): Promise<Record<string, unknown>> {
  const settings = await db.settings.toArray();
  return Object.fromEntries(settings.map(s => [s.key, s.value]));
}

// ============================================================================
// Utility Functions
// ============================================================================

export async function clearAllData(): Promise<void> {
  await db.transaction('rw',
    [db.books, db.vocab, db.knownWords, db.clozeSentences, db.dailyStats, db.settings],
    async () => {
      await db.books.clear();
      await db.vocab.clear();
      await db.knownWords.clear();
      await db.clozeSentences.clear();
      await db.dailyStats.clear();
      await db.settings.clear();
    }
  );
}

export async function exportAllData(): Promise<{
  books: Book[];
  vocab: VocabEntry[];
  knownWords: KnownWord[];
  clozeSentences: ClozeSentence[];
  dailyStats: DailyStats[];
  settings: Settings[];
}> {
  return {
    books: await db.books.toArray(),
    vocab: await db.vocab.toArray(),
    knownWords: await db.knownWords.toArray(),
    clozeSentences: await db.clozeSentences.toArray(),
    dailyStats: await db.dailyStats.toArray(),
    settings: await db.settings.toArray()
  };
}

export async function getVocabStats(): Promise<{
  total: number;
  byState: Record<WordState, number>;
}> {
  const vocab = await db.vocab.toArray();
  const byState: Record<WordState, number> = {
    new: 0,
    level1: 0,
    level2: 0,
    level3: 0,
    level4: 0,
    known: 0,
    ignored: 0
  };

  vocab.forEach(v => {
    byState[v.state]++;
  });

  return {
    total: vocab.length,
    byState
  };
}
