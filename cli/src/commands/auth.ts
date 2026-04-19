import type { ApiClient } from '../client';
import type { Format } from '../format';
import { loadConfig, saveConfig, maskToken } from '../config';
import { output } from '../format';

export async function handle(
  client: ApiClient,
  action: string,
  _id: string | undefined,
  flags: Record<string, string>,
  format: Format,
): Promise<void> {
  switch (action) {
    case 'login': {
      const config = loadConfig();
      const apiUrl = flags.url || flags['api-url'] || config.apiUrl;
      const token = flags.token;

      if (!token) {
        console.error('Usage: lector auth login --token <token> [--url <api-url>]');
        console.error('\nGenerate a token in Settings > API Tokens, then run:');
        console.error('  lector auth login --token ltr_...');
        process.exit(1);
      }

      saveConfig({ ...config, apiUrl, token });
      console.log(`Saved config. API: ${apiUrl}`);
      console.log(`Token: ${maskToken(token)}`);
      break;
    }

    case 'logout': {
      const config = loadConfig();
      delete config.token;
      saveConfig(config);
      console.log('Token removed from config.');
      break;
    }

    case 'status': {
      const config = loadConfig();
      output({
        apiUrl: config.apiUrl,
        token: config.token ? maskToken(config.token) : '(none)',
        format: config.format || 'table',
      }, format);
      break;
    }

    case 'verify': {
      try {
        const result = await client.post('/api/tokens/verify') as { valid: boolean; name?: string; scopes?: string[] };
        if (result.valid) {
          console.log(`Token valid: "${result.name}" — scopes: ${result.scopes?.join(', ')}`);
        } else {
          console.error('Token is invalid.');
          process.exit(1);
        }
      } catch (err) {
        console.error(`Verification failed: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
      break;
    }

    default:
      console.error(`Unknown auth action: ${action}`);
      console.error('Available: login, logout, status, verify');
      process.exit(1);
  }
}
