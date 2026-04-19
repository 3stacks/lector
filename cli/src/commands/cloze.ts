import type { ApiClient } from '../client';
import type { Format } from '../format';
import { output } from '../format';

export async function handle(
  client: ApiClient,
  action: string,
  id: string | undefined,
  flags: Record<string, string>,
  format: Format,
): Promise<void> {
  switch (action) {
    case 'list': {
      const params = new URLSearchParams();
      if (flags.collection) params.set('collection', flags.collection);
      if (flags.word) params.set('word', flags.word);
      if (flags.limit) params.set('limit', flags.limit);
      const query = params.toString() ? `?${params}` : '';
      const data = await client.get(`/api/cloze${query}`);
      output(data, format);
      break;
    }

    case 'due': {
      const params = new URLSearchParams();
      if (flags.mode) params.set('mode', flags.mode);
      if (flags.collection) params.set('collection', flags.collection);
      if (flags.limit) params.set('limit', flags.limit);
      const query = params.toString() ? `?${params}` : '';
      const data = await client.get(`/api/cloze/due${query}`);
      output(data, format);
      break;
    }

    case 'counts': {
      const data = await client.get('/api/cloze/counts');
      output(data, format);
      break;
    }

    case 'get': {
      if (!id) { console.error('Usage: lector cloze get <id>'); process.exit(1); }
      const data = await client.get(`/api/cloze/${id}`);
      output(data, format);
      break;
    }

    case 'review': {
      if (!id) { console.error('Usage: lector cloze review <id> --correct --mastery 50'); process.exit(1); }
      const data = await client.post(`/api/cloze/${id}/review`, {
        correct: 'correct' in flags,
        masteryLevel: flags.mastery ? parseInt(flags.mastery) : undefined,
        nextReview: flags.next || undefined,
      });
      output(data, format);
      break;
    }

    case 'delete': {
      if (!id) { console.error('Usage: lector cloze delete <id>'); process.exit(1); }
      await client.delete(`/api/cloze/${id}`);
      console.log('Deleted.');
      break;
    }

    default:
      console.error(`Unknown cloze action: ${action}`);
      console.error('Available: list, due, counts, get, review, delete');
      process.exit(1);
  }
}
