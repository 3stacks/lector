import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/server/database';

// DELETE /api/tokens/:id - Revoke a token
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = db.prepare('DELETE FROM api_tokens WHERE id = ?').run(id);

  if (result.changes === 0) {
    return NextResponse.json({ error: 'Token not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
