import { NextRequest, NextResponse } from 'next/server';
import { db, DailyStatsRow, VocabRow } from '@/lib/server/database';

// GET /api/stats - Get stats for date range
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const days = searchParams.get('days');

  let query = 'SELECT * FROM dailyStats';
  const params: string[] = [];

  if (startDate && endDate) {
    query += ' WHERE date BETWEEN ? AND ?';
    params.push(startDate, endDate);
  } else if (days) {
    const d = new Date();
    d.setDate(d.getDate() - parseInt(days) + 1);
    const start = d.toISOString().split('T')[0];
    const end = new Date().toISOString().split('T')[0];
    query += ' WHERE date BETWEEN ? AND ?';
    params.push(start, end);
  }

  query += ' ORDER BY date ASC';

  const stats = db.prepare(query).all(...params) as DailyStatsRow[];
  return NextResponse.json(stats);
}
