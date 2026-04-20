import Anthropic from '@anthropic-ai/sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { LLMProvider, CompletionOptions } from './types';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

export class AnthropicProvider implements LLMProvider {
  name = 'anthropic';
  private client: Anthropic | null = null;
  private model: string;
  private useAgentSdk: boolean;

  constructor(options?: { apiKey?: string; oauthToken?: string; model?: string }) {
    const oauthToken =
      options?.oauthToken ||
      process.env.CLAUDE_CODE_OAUTH_TOKEN ||
      process.env.CLAUDE_OAUTH_TOKEN ||
      process.env.ANTHROPIC_AUTH_TOKEN;

    const apiKey = options?.apiKey || process.env.ANTHROPIC_API_KEY;

    // OAuth tokens no longer work with the Messages API directly.
    // Use the Agent SDK (which handles OAuth internally) when we have an OAuth token.
    // Use the Anthropic SDK directly only with API keys.
    if (apiKey) {
      this.useAgentSdk = false;
      this.client = new Anthropic({ apiKey });
    } else if (oauthToken) {
      this.useAgentSdk = true;
      this.client = null;
    } else {
      this.useAgentSdk = false;
      this.client = new Anthropic();
    }
    this.model = options?.model || process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  }

  async complete(options: CompletionOptions): Promise<string> {
    if (this.useAgentSdk) {
      return this.completeViaAgentSdk(options);
    }
    return this.completeViaApi(options);
  }

  private async completeViaApi(options: CompletionOptions): Promise<string> {
    const message = await this.client!.messages.create({
      model: this.model,
      max_tokens: options.maxTokens,
      messages: options.messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    const content = message.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Anthropic');
    }

    return content.text;
  }

  private async completeViaAgentSdk(options: CompletionOptions): Promise<string> {
    // Build a single prompt from the messages
    const prompt = options.messages
      .map((m) => m.content)
      .join('\n\n');

    let resultText = '';

    for await (const message of query({
      prompt,
      options: {
        model: this.model,
        maxTurns: 1,
        systemPrompt: options.messages.find(m => m.role === 'system')?.content || undefined,
        allowedTools: [],
        permissionMode: 'bypassPermissions',
      },
    })) {
      if (message.type === 'assistant') {
        const content = (message as { message?: { content?: Array<{ type: string; text?: string }> } }).message?.content;
        if (content) {
          for (const block of content) {
            if (block.type === 'text' && block.text) {
              resultText += block.text;
            }
          }
        }
      }
      if (message.type === 'result') {
        const result = (message as { result?: string }).result;
        if (result) {
          resultText = result;
        }
      }
    }

    if (!resultText) {
      throw new Error('No text response from Agent SDK');
    }

    return resultText;
  }

  async healthCheck(): Promise<{ ok: boolean; error?: string }> {
    try {
      const result = await this.complete({
        messages: [{ role: 'user', content: 'Respond with just the word "ok"' }],
        maxTokens: 10,
      });
      return { ok: result.length > 0 };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { ok: false, error: message };
    }
  }
}
