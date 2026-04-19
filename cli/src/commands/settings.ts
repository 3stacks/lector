import type { ApiClient } from '../client';
import type { Format } from '../format';
import { output } from '../format';

export async function handle(
  client: ApiClient,
  action: string,
  key: string | undefined,
  flags: Record<string, string>,
  format: Format,
): Promise<void> {
  switch (action) {
    case 'list': {
      const data = await client.get('/api/settings');
      output(data, format);
      break;
    }

    case 'get': {
      if (!key) { console.error('Usage: lector settings get <key>'); process.exit(1); }
      const data = await client.get(`/api/settings/${key}`);
      output(data, format);
      break;
    }

    case 'set': {
      if (!key) { console.error('Usage: lector settings set <key> --value "..."'); process.exit(1); }
      const value = flags.value;
      if (value === undefined) { console.error('--value is required'); process.exit(1); }
      // Try to parse as JSON, fall back to string
      let parsed: unknown;
      try { parsed = JSON.parse(value); } catch { parsed = value; }
      await client.put(`/api/settings/${key}`, { value: parsed });
      console.log(`Set ${key}.`);
      break;
    }

    case 'delete': {
      if (!key) { console.error('Usage: lector settings delete <key>'); process.exit(1); }
      await client.delete(`/api/settings/${key}`);
      console.log(`Deleted ${key}.`);
      break;
    }

    default:
      console.error(`Unknown settings action: ${action}`);
      console.error('Available: list, get, set, delete');
      process.exit(1);
  }
}
