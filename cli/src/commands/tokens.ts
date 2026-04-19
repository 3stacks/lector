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
      const data = await client.get('/api/tokens');
      output(data, format);
      break;
    }

    case 'create': {
      const name = flags.name;
      if (!name) { console.error('Usage: lector tokens create --name "CLI" [--scopes "*"]'); process.exit(1); }
      const scopes = flags.scopes ? flags.scopes.split(',').map(s => s.trim()) : ['*'];
      const data = await client.post('/api/tokens', {
        name,
        scopes,
        expiresAt: flags.expires || undefined,
      }) as { token: string; id: string; name: string; scopes: string[] };

      if (format === 'json') {
        output(data, format);
      } else {
        console.log(`Token created: ${data.name}`);
        console.log(`Scopes: ${data.scopes.join(', ')}`);
        console.log(`\nToken (save this — it won't be shown again):\n`);
        console.log(`  ${data.token}`);
        console.log(`\nTo configure the CLI:\n  lector auth login --token ${data.token}`);
      }
      break;
    }

    case 'revoke': {
      if (!id) { console.error('Usage: lector tokens revoke <id>'); process.exit(1); }
      await client.delete(`/api/tokens/${id}`);
      console.log('Token revoked.');
      break;
    }

    default:
      console.error(`Unknown tokens action: ${action}`);
      console.error('Available: list, create, revoke');
      process.exit(1);
  }
}
