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
      if (flags.state) params.set('state', flags.state);
      if (flags.bookId) params.set('bookId', flags.bookId);
      if (flags.unpushed) params.set('unpushed', 'true');
      const query = params.toString() ? `?${params}` : '';
      const data = await client.get(`/api/vocab${query}`);
      output(data, format);
      break;
    }

    case 'get': {
      if (!id) { console.error('Usage: lector vocab get <id>'); process.exit(1); }
      const data = await client.get(`/api/vocab/${id}`);
      output(data, format);
      break;
    }

    case 'create': {
      const text = flags.text;
      if (!text) { console.error('Usage: lector vocab create --text "word" --translation "meaning"'); process.exit(1); }
      const data = await client.post('/api/vocab', {
        text,
        type: flags.type || 'word',
        sentence: flags.sentence || '',
        translation: flags.translation || '',
        state: flags.state || 'new',
      });
      output(data, format);
      break;
    }

    case 'update': {
      if (!id) { console.error('Usage: lector vocab update <id> --state known'); process.exit(1); }
      const body: Record<string, unknown> = {};
      if (flags.state) body.state = flags.state;
      if (flags.translation) body.translation = flags.translation;
      if (flags.sentence) body.sentence = flags.sentence;
      const data = await client.put(`/api/vocab/${id}`, body);
      output(data, format);
      break;
    }

    case 'delete': {
      if (!id) { console.error('Usage: lector vocab delete <id>'); process.exit(1); }
      await client.delete(`/api/vocab/${id}`);
      console.log('Deleted.');
      break;
    }

    default:
      console.error(`Unknown vocab action: ${action}`);
      console.error('Available: list, get, create, update, delete');
      process.exit(1);
  }
}
