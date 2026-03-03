import { NextRequest, NextResponse } from 'next/server';
import { db, BookRow } from '@/lib/server/database';
import fs from 'fs';

// GET /api/books/[id] - Get a single book
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(id) as BookRow | undefined;

  if (!book) {
    return NextResponse.json({ error: 'Book not found' }, { status: 404 });
  }

  return NextResponse.json({
    id: book.id,
    title: book.title,
    author: book.author,
    coverUrl: book.coverUrl,
    fileType: book.fileType,
    textContent: book.textContent,
    progress: {
      chapter: book.progress_chapter,
      scrollPosition: book.progress_scrollPosition,
      percentComplete: book.progress_percentComplete,
    },
    createdAt: book.createdAt,
    lastReadAt: book.lastReadAt,
  });
}

// PUT /api/books/[id] - Update a book
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const existing = db.prepare('SELECT * FROM books WHERE id = ?').get(id);
  if (!existing) {
    return NextResponse.json({ error: 'Book not found' }, { status: 404 });
  }

  const updates: string[] = [];
  const values: unknown[] = [];

  if (body.title !== undefined) {
    updates.push('title = ?');
    values.push(body.title);
  }
  if (body.author !== undefined) {
    updates.push('author = ?');
    values.push(body.author);
  }
  if (body.coverUrl !== undefined) {
    updates.push('coverUrl = ?');
    values.push(body.coverUrl);
  }
  if (body.textContent !== undefined) {
    updates.push('textContent = ?');
    values.push(body.textContent);
  }

  // Always update lastReadAt
  updates.push('lastReadAt = ?');
  values.push(new Date().toISOString());

  values.push(id);

  db.prepare(`UPDATE books SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  return NextResponse.json({ success: true });
}

// DELETE /api/books/[id] - Delete a book
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const book = db.prepare('SELECT filePath FROM books WHERE id = ?').get(id) as { filePath: string } | undefined;

  if (!book) {
    return NextResponse.json({ error: 'Book not found' }, { status: 404 });
  }

  // Delete file from disk
  if (fs.existsSync(book.filePath)) {
    fs.unlinkSync(book.filePath);
  }

  db.prepare('DELETE FROM books WHERE id = ?').run(id);

  return NextResponse.json({ success: true });
}
