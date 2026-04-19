import { NextRequest, NextResponse } from 'next/server';
import { db, ApiTokenRow } from '@/lib/server/database';
import { randomUUID, randomBytes } from 'crypto';
import { hashToken } from '@/lib/server/crypto';

// GET /api/tokens - List all tokens (metadata only)
export async function GET() {
  const rows = db.prepare(
    'SELECT id, name, scopes, createdAt, lastUsedAt, expiresAt FROM api_tokens ORDER BY createdAt DESC'
  ).all() as Omit<ApiTokenRow, 'tokenHash'>[];

  return NextResponse.json(rows.map(row => ({
    ...row,
    scopes: JSON.parse(row.scopes as string),
  })));
}

// POST /api/tokens - Create a new token
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, scopes = ['*'], expiresAt } = body;

  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  if (!Array.isArray(scopes) || scopes.length === 0) {
    return NextResponse.json({ error: 'Scopes must be a non-empty array' }, { status: 400 });
  }

  const bytes = randomBytes(32);
  const token = `ltr_${bytes.toString('base64url')}`;
  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO api_tokens (id, name, tokenHash, scopes, createdAt, expiresAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, name, hashToken(token), JSON.stringify(scopes), now, expiresAt || null);

  return NextResponse.json({
    id,
    name,
    token,
    scopes,
    createdAt: now,
    expiresAt: expiresAt || null,
  }, { status: 201 });
}
