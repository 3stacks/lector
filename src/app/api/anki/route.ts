import { NextRequest, NextResponse } from 'next/server';

const ANKI_CONNECT_URL = process.env.ANKI_CONNECT_URL || 'http://localhost:8765';

async function ankiRequest(action: string, params?: Record<string, unknown>) {
  const res = await fetch(ANKI_CONNECT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, version: 6, params }),
  });
  if (!res.ok) throw new Error(`AnkiConnect HTTP error: ${res.status}`);
  return res.json();
}

function triggerSync() {
  // Fire-and-forget — don't block the card-add response
  ankiRequest('sync').catch(err => console.error('[Anki] sync failed:', err));
}

// GET /api/anki — connection check + deck list
export async function GET() {
  try {
    const [versionRes, decksRes] = await Promise.all([
      ankiRequest('version'),
      ankiRequest('deckNames'),
    ]);
    return NextResponse.json({
      connected: true,
      version: versionRes.result,
      decks: decksRes.result ?? [],
    });
  } catch (err) {
    return NextResponse.json({
      connected: false,
      error: err instanceof Error ? err.message : 'Could not connect to Anki',
    });
  }
}

// POST /api/anki — proxy an AnkiConnect action, auto-sync after addNote
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, params } = body as { action: string; params?: Record<string, unknown> };

    const result = await ankiRequest(action, params);

    if (action === 'addNote' && result.error === null) {
      triggerSync();
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { result: null, error: err instanceof Error ? err.message : 'AnkiConnect request failed' },
      { status: 500 }
    );
  }
}
