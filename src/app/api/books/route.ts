import { NextRequest, NextResponse } from 'next/server';
import { db, BOOKS_DIR, BookRow } from '@/lib/server/database';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';

// GET /api/books - List all books
export async function GET() {
  const books = db.prepare(`
    SELECT * FROM books ORDER BY lastReadAt DESC
  `).all() as BookRow[];

  return NextResponse.json(books.map(b => ({
    id: b.id,
    title: b.title,
    author: b.author,
    coverUrl: b.coverUrl,
    fileType: b.fileType,
    textContent: b.textContent,
    progress: {
      chapter: b.progress_chapter,
      scrollPosition: b.progress_scrollPosition,
      percentComplete: b.progress_percentComplete,
    },
    createdAt: b.createdAt,
    lastReadAt: b.lastReadAt,
  })));
}

// POST /api/books - Create a new book
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const title = formData.get('title') as string;
  const author = (formData.get('author') as string) || 'Unknown';
  const fileType = formData.get('fileType') as string;
  const textContent = formData.get('textContent') as string | null;

  if (!title || !fileType) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const id = randomUUID();
  const ext = fileType === 'epub' ? 'epub' : fileType === 'pdf' ? 'pdf' : 'md';
  const filePath = path.join(BOOKS_DIR, `${id}.${ext}`);
  const now = new Date().toISOString();

  // Save file to disk if provided
  if (file) {
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filePath, buffer);
  } else if (textContent) {
    // For markdown, we can store text content directly
    fs.writeFileSync(filePath, textContent);
  } else {
    return NextResponse.json({ error: 'File or textContent required' }, { status: 400 });
  }

  db.prepare(`
    INSERT INTO books (id, title, author, filePath, fileType, textContent, createdAt, lastReadAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, title, author, filePath, fileType, textContent, now, now);

  return NextResponse.json({ id });
}
