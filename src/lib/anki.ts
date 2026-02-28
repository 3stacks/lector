// AnkiConnect API client
import { getSetting } from './db';

const DEFAULT_ANKI_URL = "http://localhost:8765";
const ANKI_CONNECT_VERSION = 6;

async function getAnkiUrl(): Promise<string> {
  const url = await getSetting<string>('ankiConnectUrl');
  return url || DEFAULT_ANKI_URL;
}

// Types
interface AnkiConnectRequest {
  action: string;
  version: number;
  params?: Record<string, unknown>;
}

interface AnkiConnectResponse<T = unknown> {
  result: T;
  error: string | null;
}

interface CardInfo {
  cardId: number;
  fields: Record<string, { value: string; order: number }>;
  interval: number;
  note: number;
  deckName: string;
}

/**
 * Make a request to AnkiConnect
 */
async function ankiRequest<T>(
  action: string,
  params?: Record<string, unknown>
): Promise<T> {
  const request: AnkiConnectRequest = {
    action,
    version: ANKI_CONNECT_VERSION,
    params,
  };

  const ankiUrl = await getAnkiUrl();

  try {
    const response = await fetch(ankiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`AnkiConnect HTTP error: ${response.status}`);
    }

    const data = (await response.json()) as AnkiConnectResponse<T>;

    if (data.error) {
      throw new Error(`AnkiConnect error: ${data.error}`);
    }

    return data.result;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes("fetch")) {
      throw new Error(
        "Could not connect to Anki. Make sure Anki is running with AnkiConnect installed."
      );
    }
    throw error;
  }
}

/**
 * Check if Anki is running and AnkiConnect is available
 * @returns true if connected, false otherwise
 */
export async function isAnkiConnected(): Promise<boolean> {
  try {
    const version = await ankiRequest<number>("version");
    return version >= ANKI_CONNECT_VERSION;
  } catch {
    return false;
  }
}

/**
 * Get all deck names from Anki
 * @returns Array of deck names
 */
export async function getDeckNames(): Promise<string[]> {
  return ankiRequest<string[]>("deckNames");
}

/**
 * Create a deck if it doesn't exist
 * @param deckName - Name of the deck to create
 */
async function ensureDeckExists(deckName: string): Promise<void> {
  await ankiRequest("createDeck", { deck: deckName });
}

/**
 * Add a basic (front/back) card to Anki
 * @param deckName - Name of the deck to add the card to
 * @param sentence - The Afrikaans sentence containing the target word
 * @param targetWord - The word being learned
 * @param translation - English translation of the sentence
 * @param wordMeaning - English meaning of the target word
 * @returns The note ID of the created card
 */
export async function addBasicCard(
  deckName: string,
  sentence: string,
  targetWord: string,
  translation: string,
  wordMeaning: string
): Promise<number> {
  await ensureDeckExists(deckName);

  // Highlight the target word in the sentence
  const highlightedSentence = sentence.replace(
    new RegExp(`\\b(${escapeRegex(targetWord)})\\b`, "gi"),
    "<b>$1</b>"
  );

  const noteId = await ankiRequest<number>("addNote", {
    note: {
      deckName,
      modelName: "Basic",
      fields: {
        Front: `${highlightedSentence}<br><br><small>Word: <b>${targetWord}</b></small>`,
        Back: `${translation}<br><br><b>${targetWord}</b> = ${wordMeaning}`,
      },
      options: {
        allowDuplicate: false,
        duplicateScope: "deck",
      },
      tags: ["afrikaans-reader", "vocabulary"],
    },
  });

  return noteId;
}

/**
 * Add a cloze deletion card to Anki
 * @param deckName - Name of the deck to add the card to
 * @param sentence - The Afrikaans sentence containing the target word
 * @param targetWord - The word being learned (will be hidden in cloze)
 * @param translation - English translation of the sentence
 * @param wordMeaning - English meaning of the target word
 * @returns The note ID of the created card
 */
export async function addClozeCard(
  deckName: string,
  sentence: string,
  targetWord: string,
  translation: string,
  wordMeaning: string
): Promise<number> {
  await ensureDeckExists(deckName);

  // Create cloze deletion by replacing the target word
  const clozeText = sentence.replace(
    new RegExp(`\\b(${escapeRegex(targetWord)})\\b`, "gi"),
    "{{c1::$1}}"
  );

  const noteId = await ankiRequest<number>("addNote", {
    note: {
      deckName,
      modelName: "Cloze",
      fields: {
        Text: `${clozeText}<br><br><small>Translation: ${translation}</small>`,
        Extra: `<b>${targetWord}</b> = ${wordMeaning}`,
      },
      options: {
        allowDuplicate: false,
        duplicateScope: "deck",
      },
      tags: ["afrikaans-reader", "vocabulary", "cloze"],
    },
  });

  return noteId;
}

/**
 * Get word states based on Anki intervals for syncing mastery levels
 * This queries Anki for cards with the afrikaans-reader tag and returns
 * their intervals, which can be used to determine mastery level
 */
export async function syncWordStates(): Promise<
  Map<string, { interval: number; deckName: string }>
> {
  // Find all cards with our tag
  const cardIds = await ankiRequest<number[]>("findCards", {
    query: "tag:afrikaans-reader",
  });

  if (cardIds.length === 0) {
    return new Map();
  }

  // Get card info
  const cardsInfo = await ankiRequest<CardInfo[]>("cardsInfo", {
    cards: cardIds,
  });

  // Build a map of word -> interval
  const wordStates = new Map<string, { interval: number; deckName: string }>();

  for (const card of cardsInfo) {
    // Extract the target word from the card
    // This depends on how we format cards - look for bold text
    const frontField =
      card.fields["Front"]?.value || card.fields["Text"]?.value || "";
    const wordMatch = frontField.match(/<b>([^<]+)<\/b>/);

    if (wordMatch) {
      const word = wordMatch[1].toLowerCase();
      // Keep the card with the highest interval (most learned)
      const existing = wordStates.get(word);
      if (!existing || card.interval > existing.interval) {
        wordStates.set(word, {
          interval: card.interval,
          deckName: card.deckName,
        });
      }
    }
  }

  return wordStates;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
