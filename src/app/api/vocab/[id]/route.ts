import { NextRequest, NextResponse } from 'next/server';
import { db, VocabRow } from '@/lib/server/database';

// GET /api/vocab/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const vocab = db.prepare('SELECT * FROM vocab WHERE id = ?').get(id) as VocabRow | undefined;

  if (!vocab) {
    return NextResponse.json({ error: 'Vocab not found' }, { status: 404 });
  }

  return NextResponse.json({
    ...vocab,
    pushedToAnki: vocab.pushedToAnki === 1,
  });
}

// PUT /api/vocab/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const existing = db.prepare('SELECT * FROM vocab WHERE id = ?').get(id) as VocabRow | undefined;
  if (!existing) {
    return NextResponse.json({ error: 'Vocab not found' }, { status: 404 });
  }

  const updates: string[] = [];
  const values: unknown[] = [];

  if (body.state !== undefined) {
    updates.push('state = ?', 'stateUpdatedAt = ?');
    values.push(body.state, new Date().toISOString());
    // Update knownWords table too
    db.prepare('INSERT OR REPLACE INTO knownWords (word, state) VALUES (?, ?)').run(existing.text.toLowerCase(), body.state);
  }
  if (body.translation !== undefined) {
    updates.push('translation = ?');
    values.push(body.translation);
  }
  if (body.sentence !== undefined) {
    updates.push('sentence = ?');
    values.push(body.sentence);
  }
  if (body.reviewCount !== undefined) {
    updates.push('reviewCount = ?');
    values.push(body.reviewCount);
  }
  if (body.pushedToAnki !== undefined) {
    updates.push('pushedToAnki = ?');
    values.push(body.pushedToAnki ? 1 : 0);
  }
  if (body.ankiNoteId !== undefined) {
    updates.push('ankiNoteId = ?');
    values.push(body.ankiNoteId);
  }

  if (updates.length > 0) {
    values.push(id);
    db.prepare(`UPDATE vocab SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/vocab/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const vocab = db.prepare('SELECT text FROM vocab WHERE id = ?').get(id) as { text: string } | undefined;

  if (!vocab) {
    return NextResponse.json({ error: 'Vocab not found' }, { status: 404 });
  }

  db.prepare('DELETE FROM vocab WHERE id = ?').run(id);

  // Check if other entries exist with same word
  const others = db.prepare('SELECT COUNT(*) as count FROM vocab WHERE LOWER(text) = ?').get(vocab.text.toLowerCase()) as { count: number };
  if (others.count === 0) {
    db.prepare('DELETE FROM knownWords WHERE word = ?').run(vocab.text.toLowerCase());
  }

  return NextResponse.json({ success: true });
}
