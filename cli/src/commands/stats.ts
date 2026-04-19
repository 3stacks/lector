import type { ApiClient } from '../client';
import type { Format } from '../format';
import { output } from '../format';

export async function handle(
  client: ApiClient,
  action: string,
  _id: string | undefined,
  flags: Record<string, string>,
  format: Format,
): Promise<void> {
  switch (action) {
    case 'today': {
      const data = await client.get('/api/stats/today');
      output(data, format);
      break;
    }

    case 'range': {
      const params = new URLSearchParams();
      if (flags.start) params.set('startDate', flags.start);
      if (flags.end) params.set('endDate', flags.end);
      if (flags.days) params.set('days', flags.days);
      const query = params.toString() ? `?${params}` : '';
      const data = await client.get(`/api/stats${query}`);
      output(data, format);
      break;
    }

    case 'streak': {
      const data = await client.get('/api/stats/streak');
      output(data, format);
      break;
    }

    case 'increment': {
      const field = flags.field;
      if (!field) { console.error('Usage: lector stats increment --field wordsRead [--amount 1]'); process.exit(1); }
      const data = await client.put('/api/stats/today', {
        field,
        amount: flags.amount ? parseInt(flags.amount) : 1,
      });
      output(data, format);
      break;
    }

    default:
      console.error(`Unknown stats action: ${action}`);
      console.error('Available: today, range, streak, increment');
      process.exit(1);
  }
}
