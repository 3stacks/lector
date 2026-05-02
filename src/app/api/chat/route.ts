import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const API_URL = process.env.INTERNAL_API_URL || 'http://localhost:3457';

// GET /api/chat — fetch message history
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const params = new URLSearchParams();
  if (searchParams.get('limit')) params.set('limit', searchParams.get('limit')!);
  if (searchParams.get('before')) params.set('before', searchParams.get('before')!);

  const response = await fetch(`${API_URL}/api/chat?${params}`);
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}

// POST /api/chat — send a message, get assistant response
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
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

// DELETE /api/chat — clear chat history
export async function DELETE() {
  const response = await fetch(`${API_URL}/api/chat`, { method: 'DELETE' });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
