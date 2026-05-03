import { NextRequest, NextResponse } from 'next/server';
import { db, ChatMessageRow } from '@/lib/server/database';

export const dynamic = 'force-dynamic';

const API_URL = process.env.INTERNAL_API_URL || 'http://localhost:3457';
const TTL_DAYS = 7;

function cleanExpired() {
  db.prepare(
    `DELETE FROM chat_messages WHERE createdAt < datetime('now', '-${TTL_DAYS} days')`
  ).run();
}

// GET /api/chat — fetch message history
export async function GET(request: NextRequest) {
  cleanExpired();

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '50');
  const before = searchParams.get('before');

  let messages: ChatMessageRow[];

  if (before) {
    messages = db
      .prepare('SELECT * FROM chat_messages WHERE createdAt < ? ORDER BY createdAt DESC LIMIT ?')
      .all(before, limit) as ChatMessageRow[];
  } else {
    messages = db
      .prepare('SELECT * FROM chat_messages ORDER BY createdAt DESC LIMIT ?')
      .all(limit) as ChatMessageRow[];
  }

  return NextResponse.json(messages.reverse());
}

// POST /api/chat — send a message, get assistant response (proxy to Hono API for LLM)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.message?.trim()) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    const response = await fetch(`${API_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Chat proxy error:', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}

// DELETE /api/chat — clear all chat history
export async function DELETE() {
  db.prepare('DELETE FROM chat_messages').run();
  return NextResponse.json({ ok: true });
}
