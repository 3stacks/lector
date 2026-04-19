import fs from 'fs';
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
    case 'export': {
      const data = await client.get('/api/data');
      if (flags.file) {
        fs.writeFileSync(flags.file, JSON.stringify(data, null, 2));
        console.log(`Exported to ${flags.file}`);
      } else {
        output(data, 'json'); // Always JSON for export
      }
      break;
    }

    case 'import': {
      const file = flags.file;
      if (!file) { console.error('Usage: lector data import --file backup.json'); process.exit(1); }
      if (!fs.existsSync(file)) { console.error(`File not found: ${file}`); process.exit(1); }
      const content = JSON.parse(fs.readFileSync(file, 'utf-8'));
      const data = await client.post('/api/data', content);
      output(data, format);
      break;
    }

    default:
      console.error(`Unknown data action: ${action}`);
      console.error('Available: export, import');
      process.exit(1);
  }
}
