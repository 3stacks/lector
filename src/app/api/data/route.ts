import { NextRequest, NextResponse } from 'next/server';
import { db, BOOKS_DIR } from '@/lib/server/database';
import fs from 'fs';
import path from 'path';

// GET /api/data - Export all data
export async function GET() {
  const books = db.prepare('SELECT * FROM books').all();
  const vocab = db.prepare('SELECT * FROM vocab').all();
  const knownWords = db.prepare('SELECT * FROM knownWords').all();
  const clozeSentences = db.prepare('SELECT * FROM clozeSentences').all();
  const dailyStats = db.prepare('SELECT * FROM dailyStats').all();
  const settings = db.prepare('SELECT * FROM settings').all();

  return NextResponse.json({
    exportedAt: new Date().toISOString(),
    books,
    vocab,
    knownWords,
    clozeSentences,
    dailyStats,
    settings,
  });
}

// POST /api/data - Import data (from Dexie export or backup)
export async function POST(request: NextRequest) {
  const data = await request.json();
  const results = {
    books: 0,
    vocab: 0,
    knownWords: 0,
    clozeSentences: 0,
    dailyStats: 0,
    settings: 0,
  };

  // Import books (without file data - those need separate upload)
  if (data.books?.length) {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO books (id, title, author, coverUrl, filePath, fileType, progress_chapter, progress_scrollPosition, progress_percentComplete, textContent, createdAt, lastReadAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const book of data.books) {
      // For imported books, create a placeholder file path
      const ext = book.fileType === 'epub' ? 'epub' : book.fileType === 'pdf' ? 'pdf' : 'md';
      const filePath = book.filePath || path.join(BOOKS_DIR, `${book.id}.${ext}`);

      // If textContent exists (markdown), save it to file
      if (book.textContent && book.fileType === 'markdown') {
        fs.writeFileSync(filePath, book.textContent);
      }

      stmt.run(
        book.id,
        book.title,
        book.author || 'Unknown',
        book.coverUrl || null,
        filePath,
        book.fileType || 'epub',
        book.progress?.chapter ?? book.progress_chapter ?? 0,
        book.progress?.scrollPosition ?? book.progress_scrollPosition ?? 0,
        book.progress?.percentComplete ?? book.progress_percentComplete ?? 0,
        book.textContent || null,
        book.createdAt || new Date().toISOString(),
        book.lastReadAt || new Date().toISOString()
      );
      results.books++;
    }
  }

  // Import vocab
  if (data.vocab?.length) {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO vocab (id, text, type, sentence, translation, state, stateUpdatedAt, reviewCount, bookId, chapter, createdAt, pushedToAnki, ankiNoteId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const v of data.vocab) {
      stmt.run(
        v.id,
        v.text,
        v.type || 'word',
        v.sentence || '',
        v.translation || '',
        v.state || 'new',
        v.stateUpdatedAt || new Date().toISOString(),
        v.reviewCount || 0,
        v.bookId || null,
        v.chapter || null,
        v.createdAt || new Date().toISOString(),
        v.pushedToAnki ? 1 : 0,
        v.ankiNoteId || null
      );
      results.vocab++;
    }
  }

  // Import known words
  if (data.knownWords?.length) {
    const stmt = db.prepare('INSERT OR REPLACE INTO knownWords (word, state) VALUES (?, ?)');
    for (const w of data.knownWords) {
      stmt.run(w.word, w.state);
      results.knownWords++;
    }
  }

  // Import cloze sentences
  if (data.clozeSentences?.length) {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO clozeSentences (id, sentence, clozeWord, clozeIndex, translation, source, collection, wordRank, tatoebaSentenceId, vocabEntryId, masteryLevel, nextReview, reviewCount, lastReviewed, timesCorrect, timesIncorrect)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const c of data.clozeSentences) {
      stmt.run(
        c.id,
        c.sentence,
        c.clozeWord,
        c.clozeIndex,
        c.translation,
        c.source || 'tatoeba',
        c.collection || 'random',
        c.wordRank || null,
        c.tatoebaSentenceId || null,
        c.vocabEntryId || null,
        c.masteryLevel || 0,
        c.nextReview || new Date().toISOString(),
        c.reviewCount || 0,
        c.lastReviewed || null,
        c.timesCorrect || 0,
        c.timesIncorrect || 0
      );
      results.clozeSentences++;
    }
  }

  // Import daily stats
  if (data.dailyStats?.length) {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO dailyStats (date, wordsRead, newWordsSaved, wordsMarkedKnown, minutesRead, clozePracticed, points, dictionaryLookups)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const s of data.dailyStats) {
      stmt.run(
        s.date,
        s.wordsRead || 0,
        s.newWordsSaved || 0,
        s.wordsMarkedKnown || 0,
        s.minutesRead || 0,
        s.clozePracticed || 0,
        s.points || 0,
        s.dictionaryLookups || 0
      );
      results.dailyStats++;
    }
  }

  // Import settings
  if (data.settings?.length) {
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    for (const s of data.settings) {
      const value = typeof s.value === 'string' ? s.value : JSON.stringify(s.value);
      stmt.run(s.key, value);
      results.settings++;
    }
  }

  return NextResponse.json({
    success: true,
    imported: results,
  });
}
