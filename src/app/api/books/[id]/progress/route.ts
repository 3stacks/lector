import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/server/database';

// PUT /api/books/[id]/progress - Update book progress
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const existing = db.prepare('SELECT id FROM books WHERE id = ?').get(id);
  if (!existing) {
    return NextResponse.json({ error: 'Book not found' }, { status: 404 });
  }

  db.prepare(`
    UPDATE books SET
      progress_chapter = ?,
      progress_scrollPosition = ?,
      progress_percentComplete = ?,
      lastReadAt = ?
    WHERE id = ?
  `).run(
    body.chapter ?? 0,
    body.scrollPosition ?? 0,
    body.percentComplete ?? 0,
    new Date().toISOString(),
    id
  );

  return NextResponse.json({ success: true });
}
