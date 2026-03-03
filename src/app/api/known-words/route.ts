import { NextRequest, NextResponse } from 'next/server';
import { db, KnownWordRow } from '@/lib/server/database';

// GET /api/known-words - Get all known words as a map
export async function GET() {
  const words = db.prepare('SELECT * FROM knownWords').all() as KnownWordRow[];
  const map: Record<string, string> = {};
  for (const w of words) {
    map[w.word] = w.state;
  }
  return NextResponse.json(map);
}

// POST /api/known-words - Bulk update known words
export async function POST(request: NextRequest) {
  const body = await request.json();

  if (!Array.isArray(body.updates)) {
    return NextResponse.json({ error: 'updates array required' }, { status: 400 });
  }

  const stmt = db.prepare('INSERT OR REPLACE INTO knownWords (word, state) VALUES (?, ?)');
  const transaction = db.transaction((updates: Array<{ word: string; state: string }>) => {
    for (const u of updates) {
      stmt.run(u.word.toLowerCase(), u.state);
    }
  });

  transaction(body.updates);

  return NextResponse.json({ success: true, count: body.updates.length });
}
