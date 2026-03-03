import { NextRequest, NextResponse } from 'next/server';
import { db, ClozeSentenceRow, ClozeMasteryLevel } from '@/lib/server/database';

// POST /api/cloze/[id]/review - Record a review result
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const sentence = db.prepare('SELECT * FROM clozeSentences WHERE id = ?').get(id) as ClozeSentenceRow | undefined;
  if (!sentence) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const correct = body.correct as boolean;
  const newMasteryLevel = body.masteryLevel as ClozeMasteryLevel;
  const nextReview = body.nextReview as string;

  db.prepare(`
    UPDATE clozeSentences SET
      masteryLevel = ?,
      nextReview = ?,
      reviewCount = reviewCount + 1,
      lastReviewed = ?,
      timesCorrect = timesCorrect + ?,
      timesIncorrect = timesIncorrect + ?
    WHERE id = ?
  `).run(
    newMasteryLevel,
    nextReview,
    new Date().toISOString(),
    correct ? 1 : 0,
    correct ? 0 : 1,
    id
  );

  return NextResponse.json({ success: true });
}
