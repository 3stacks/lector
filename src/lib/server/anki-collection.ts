import Database from 'better-sqlite3';
import crypto from 'crypto';

function getAnkiDb() {
  const collectionPath = process.env.ANKI_COLLECTION_PATH;
  if (!collectionPath) throw new Error('ANKI_COLLECTION_PATH is not set');
  return new Database(collectionPath, { timeout: 5000 });
}

function fieldChecksum(text: string): number {
  const plain = text.replace(/<[^>]+>/g, '').trim();
  const hash = crypto.createHash('sha1').update(plain).digest('hex');
  return parseInt(hash.slice(0, 8), 16);
}

function randomGuid(): string {
  return crypto.randomBytes(8).toString('base64url').slice(0, 10);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface CollectionRow {
  decks: string;
  models: string;
  usn: number;
}

export function getDeckNames(): string[] {
  const db = getAnkiDb();
  try {
    const row = db.prepare('SELECT decks FROM col').get() as CollectionRow;
    const decks = JSON.parse(row.decks) as Record<string, { id: number; name: string }>;
    return Object.values(decks)
      .map(d => d.name)
      .filter(name => name !== 'Default')
      .sort();
  } finally {
    db.close();
  }
}

export function isAvailable(): boolean {
  try {
    const db = getAnkiDb();
    db.prepare('SELECT 1 FROM col').get();
    db.close();
    return true;
  } catch {
    return false;
  }
}

export function addNote(params: {
  deckName: string;
  modelName: 'Basic' | 'Cloze';
  fields: Record<string, string>;
  tags?: string[];
}): number {
  const db = getAnkiDb();
  try {
    const row = db.prepare('SELECT decks, models FROM col').get() as CollectionRow;
    const decks = JSON.parse(row.decks) as Record<string, { id: number; name: string }>;
    const models = JSON.parse(row.models) as Record<string, { id: number; name: string; flds: { name: string; ord: number }[] }>;

    const deck = Object.values(decks).find(d => d.name === params.deckName);
    if (!deck) throw new Error(`Deck "${params.deckName}" not found. Available: ${Object.values(decks).map(d => d.name).join(', ')}`);

    const model = Object.values(models).find(m => m.name === params.modelName);
    if (!model) throw new Error(`Model "${params.modelName}" not found`);

    const now = Math.floor(Date.now() / 1000);
    // Use different ms timestamps to avoid collision between note and card IDs
    const noteId = Date.now();
    const cardId = noteId + 1;

    const fieldValues = [...model.flds]
      .sort((a, b) => a.ord - b.ord)
      .map(f => params.fields[f.name] ?? '');

    const fldsStr = fieldValues.join('\x1f');
    const sfld = fieldValues[0];
    const csum = fieldChecksum(sfld);
    const guid = randomGuid();
    const tagsStr = params.tags?.length ? ` ${params.tags.join(' ')} ` : '';

    const duePos = (db.prepare(
      'SELECT COALESCE(MAX(due), 0) + 1 AS next FROM cards WHERE did = ? AND type = 0'
    ).get(deck.id) as { next: number }).next;

    const insertNote = db.prepare(`
      INSERT INTO notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data)
      VALUES (?, ?, ?, ?, -1, ?, ?, ?, ?, 0, '')
    `);

    const insertCard = db.prepare(`
      INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data)
      VALUES (?, ?, ?, 0, ?, -1, 0, 0, ?, 0, 0, 0, 0, 0, 0, 0, 0, '')
    `);

    const updateCol = db.prepare('UPDATE col SET mod = ?');

    db.transaction(() => {
      insertNote.run(noteId, guid, model.id, now, tagsStr, fldsStr, sfld, csum);
      insertCard.run(cardId, noteId, deck.id, now, duePos);
      updateCol.run(now);
    })();

    return noteId;
  } finally {
    db.close();
  }
}

export function buildBasicFields(
  sentence: string,
  targetWord: string,
  translation: string,
  wordMeaning: string
): Record<string, string> {
  const highlighted = sentence.replace(
    new RegExp(`\\b(${escapeRegex(targetWord)})\\b`, 'gi'),
    '<b>$1</b>'
  );
  return {
    Front: `${highlighted}<br><br><small>Word: <b>${targetWord}</b></small>`,
    Back: `${translation}<br><br><b>${targetWord}</b> = ${wordMeaning}`,
  };
}

export function buildClozeFields(
  sentence: string,
  targetWord: string,
  translation: string,
  wordMeaning: string
): Record<string, string> {
  const clozeText = sentence.replace(
    new RegExp(`\\b(${escapeRegex(targetWord)})\\b`, 'gi'),
    '{{c1::$1}}'
  );
  return {
    Text: `${clozeText}<br><br><small>Translation: ${translation}</small>`,
    Extra: `<b>${targetWord}</b> = ${wordMeaning}`,
  };
}
