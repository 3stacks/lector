import dictionaryData from './dictionary-data.json';

export interface DictionaryEntry {
  word: string;
  rank: number;
  translation: string;
  partOfSpeech: string;
}

// Create a Map for O(1) lookup by word
const dictionaryMap = new Map<string, DictionaryEntry>();

// Populate the map from the JSON data
(dictionaryData as DictionaryEntry[]).forEach((entry) => {
  dictionaryMap.set(entry.word.toLowerCase(), entry);
});

/**
 * Look up a word in the dictionary
 * @param word - The word to look up (case-insensitive)
 * @returns The dictionary entry or undefined if not found
 */
export function lookupWord(word: string): DictionaryEntry | undefined {
  return dictionaryMap.get(word.toLowerCase());
}

/**
 * Check if a word exists in the dictionary
 * @param word - The word to check (case-insensitive)
 * @returns true if the word is in the dictionary
 */
export function hasWord(word: string): boolean {
  return dictionaryMap.has(word.toLowerCase());
}

/**
 * Get all dictionary entries
 * @returns Array of all dictionary entries sorted by rank
 */
export function getAllEntries(): DictionaryEntry[] {
  return dictionaryData as DictionaryEntry[];
}

/**
 * Get the dictionary map for direct access
 * @returns The Map containing all dictionary entries
 */
export function getDictionaryMap(): Map<string, DictionaryEntry> {
  return dictionaryMap;
}

/**
 * Get word frequency rank (lower = more common)
 * @param word - The word to check
 * @returns The rank (1-2000) or undefined if not in top 2000
 */
export function getWordRank(word: string): number | undefined {
  const entry = dictionaryMap.get(word.toLowerCase());
  return entry?.rank;
}

export default dictionaryMap;
