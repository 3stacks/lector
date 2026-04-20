import type { LLMProvider } from './types';
import { OllamaProvider } from './ollama';
import { AnthropicProvider } from './anthropic';
import { ApfelProvider } from './apfel';
import { db } from '../../db';

export type { LLMProvider, ChatMessage, CompletionOptions } from './types';

let cachedProvider: LLMProvider | null = null;
let cachedProviderKey: string | null = null;

function getSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
}

export function getProvider(): LLMProvider {
  const name = getSetting('llmProvider') || process.env.LLM_PROVIDER || 'anthropic';

  let cacheKey: string;
  switch (name) {
    case 'anthropic': {
      const apiKey = getSetting('anthropicApiKey') || undefined;
      const oauthToken = getSetting('claudeOauthToken') || undefined;
      const model = process.env.ANTHROPIC_MODEL || undefined;
      cacheKey = `anthropic:${apiKey ? 'key' : oauthToken ? 'oauth' : 'env'}:${model || 'default'}`;
      if (cachedProvider && cachedProviderKey === cacheKey) return cachedProvider;
      cachedProvider = new AnthropicProvider({ apiKey, oauthToken, model });
      break;
    }
    case 'apfel': {
      const model = getSetting('apfelModel') || process.env.APFEL_MODEL || undefined;
      const url = getSetting('apfelUrl') || process.env.APFEL_URL || undefined;
      cacheKey = `apfel:${model || 'default'}:${url || 'default'}`;
      if (cachedProvider && cachedProviderKey === cacheKey) return cachedProvider;
      cachedProvider = new ApfelProvider(url, model);
      break;
    }
    case 'ollama': {
      const model = getSetting('ollamaModel') || process.env.OLLAMA_MODEL || undefined;
      cacheKey = `ollama:${model || 'default'}`;
      if (cachedProvider && cachedProviderKey === cacheKey) return cachedProvider;
      cachedProvider = new OllamaProvider(undefined, model);
      break;
    }
    default: {
      cacheKey = `${name}:default`;
      if (cachedProvider && cachedProviderKey === cacheKey) return cachedProvider;
      cachedProvider = new OllamaProvider();
      break;
    }
  }

  cachedProviderKey = cacheKey;
  return cachedProvider;
}

/** Clear cached provider (e.g. when settings change) */
export function resetProvider(): void {
  cachedProvider = null;
  cachedProviderKey = null;
}
