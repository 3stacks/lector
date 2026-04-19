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
      const data = await client.get('/api/collections');
      output(data, format);
      break;
    }

    case 'get': {
      if (!id) { console.error('Usage: lector collections get <id>'); process.exit(1); }
      const data = await client.get(`/api/collections/${id}`);
      output(data, format);
      break;
    }

    case 'create': {
      const title = flags.title;
      if (!title) { console.error('Usage: lector collections create --title "..."'); process.exit(1); }
      const data = await client.post('/api/collections', {
        title,
        author: flags.author || 'Unknown',
        coverUrl: flags.cover || undefined,
      });
      output(data, format);
      break;
    }

    case 'update': {
      if (!id) { console.error('Usage: lector collections update <id> --title "..."'); process.exit(1); }
      const body: Record<string, string> = {};
      if (flags.title) body.title = flags.title;
      if (flags.author) body.author = flags.author;
      if (flags.cover) body.coverUrl = flags.cover;
      const data = await client.put(`/api/collections/${id}`, body);
      output(data, format);
      break;
    }

    case 'delete': {
      if (!id) { console.error('Usage: lector collections delete <id>'); process.exit(1); }
      await client.delete(`/api/collections/${id}`);
      console.log('Deleted.');
      break;
    }

    case 'lessons': {
      if (!id) { console.error('Usage: lector collections lessons <id>'); process.exit(1); }
      const data = await client.get(`/api/collections/${id}/lessons`);
      output(data, format);
      break;
    }

    case 'add-lesson': {
      if (!id) { console.error('Usage: lector collections add-lesson <id> --title "..."'); process.exit(1); }
      const title = flags.title;
      if (!title) { console.error('--title is required'); process.exit(1); }
      const data = await client.post(`/api/collections/${id}/lessons`, {
        title,
        textContent: flags.text || '',
      });
      output(data, format);
      break;
    }

    default:
      console.error(`Unknown collections action: ${action}`);
      console.error('Available: list, get, create, update, delete, lessons, add-lesson');
      process.exit(1);
  }
}
