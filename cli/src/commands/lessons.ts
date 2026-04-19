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
    case 'get': {
      if (!id) { console.error('Usage: lector lessons get <id>'); process.exit(1); }
      const data = await client.get(`/api/lessons/${id}`);
      output(data, format);
      break;
    }

    case 'update': {
      if (!id) { console.error('Usage: lector lessons update <id> --title "..."'); process.exit(1); }
      const body: Record<string, unknown> = {};
      if (flags.title) body.title = flags.title;
      if (flags.text) body.textContent = flags.text;
      if (flags.order) body.sortOrder = parseInt(flags.order);
      const data = await client.put(`/api/lessons/${id}`, body);
      output(data, format);
      break;
    }

    case 'delete': {
      if (!id) { console.error('Usage: lector lessons delete <id>'); process.exit(1); }
      await client.delete(`/api/lessons/${id}`);
      console.log('Deleted.');
      break;
    }

    case 'progress': {
      if (!id) { console.error('Usage: lector lessons progress <id> --scroll 100 --percent 50'); process.exit(1); }
      const body: Record<string, number> = {};
      if (flags.scroll) body.scrollPosition = parseInt(flags.scroll);
      if (flags.percent) body.percentComplete = parseFloat(flags.percent);
      const data = await client.put(`/api/lessons/${id}/progress`, body);
      output(data, format);
      break;
    }

    default:
      console.error(`Unknown lessons action: ${action}`);
      console.error('Available: get, update, delete, progress');
      process.exit(1);
  }
}
