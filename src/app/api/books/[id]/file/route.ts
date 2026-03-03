import { NextRequest, NextResponse } from 'next/server';
import { db, BookRow } from '@/lib/server/database';
import fs from 'fs';

// GET /api/books/[id]/file - Download book file
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const book = db.prepare('SELECT filePath, fileType FROM books WHERE id = ?').get(id) as Pick<BookRow, 'filePath' | 'fileType'> | undefined;

  if (!book) {
    return NextResponse.json({ error: 'Book not found' }, { status: 404 });
  }

  if (!fs.existsSync(book.filePath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const fileBuffer = fs.readFileSync(book.filePath);

  const contentType = book.fileType === 'epub'
    ? 'application/epub+zip'
    : book.fileType === 'pdf'
      ? 'application/pdf'
      : 'text/markdown';

  return new NextResponse(fileBuffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': fileBuffer.length.toString(),
    },
  });
}

// PUT /api/books/[id]/file - Upload/replace book file
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const book = db.prepare('SELECT filePath FROM books WHERE id = ?').get(id) as { filePath: string } | undefined;

  if (!book) {
    return NextResponse.json({ error: 'Book not found' }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File;

  if (!file) {
    return NextResponse.json({ error: 'File required' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(book.filePath, buffer);

  return NextResponse.json({ success: true });
}
