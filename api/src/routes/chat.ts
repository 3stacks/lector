import { Hono } from 'hono';
import { db, ChatMessageRow } from '../db';
import { getProvider } from '../lib/llm';
import { randomUUID } from 'crypto';

const app = new Hono();

const SYSTEM_PROMPT = `You are a friendly Afrikaans language tutor helping an English speaker learn Afrikaans. Answer questions about grammar, vocabulary, usage, idioms, and differences between similar words or phrases. Keep answers concise and educational. Use examples where helpful. Reply in English unless the student writes in Afrikaans, in which case reply in Afrikaans with an English explanation.`;

const MAX_CONTEXT_MESSAGES = 20;
const TTL_DAYS = 7;

function cleanExpired() {
  db.prepare(
    `DELETE FROM chat_messages WHERE createdAt < datetime('now', '-${TTL_DAYS} days')`
  ).run();
}

// GET /api/chat — fetch message history
app.get('/', (c) => {
  cleanExpired();

  const limit = parseInt(c.req.query('limit') || '50');
  const before = c.req.query('before'); // cursor for infinite scroll

  let messages: ChatMessageRow[];

  if (before) {
    messages = db
      .prepare('SELECT * FROM chat_messages WHERE createdAt < ? ORDER BY createdAt DESC LIMIT ?')
      .all(before, limit) as ChatMessageRow[];
  } else {
    messages = db
      .prepare('SELECT * FROM chat_messages ORDER BY createdAt DESC LIMIT ?')
      .all(limit) as ChatMessageRow[];
  }

  return c.json(messages.reverse());
});

// POST /api/chat — send a message, get assistant response
app.post('/', async (c) => {
  try {
    cleanExpired();

    const { message } = await c.req.json();

    if (!message?.trim()) {
      return c.json({ error: 'message is required' }, 400);
    }

    const now = new Date().toISOString();
    const userMsg: ChatMessageRow = {
      id: randomUUID(),
      role: 'user',
      content: message.trim(),
      provider: null,
      createdAt: now,
    };

    // Build conversation history for LLM (include the new message)
    const recentMessages = db
      .prepare(
        'SELECT * FROM chat_messages ORDER BY createdAt DESC LIMIT ?'
      )
      .all(MAX_CONTEXT_MESSAGES - 1) as ChatMessageRow[];

    const history = [...recentMessages.reverse(), userMsg];

    // Prepend the system prompt to the first user message so it works
    // across all providers (Anthropic API doesn't accept role: 'system')
    const chatHistory = history.map((m, i) => {
      if (i === 0 && m.role === 'user') {
        return {
          role: 'user' as const,
          content: `${SYSTEM_PROMPT}\n\nStudent's question: ${m.content}`,
        };
      }
      return { role: m.role as 'user' | 'assistant', content: m.content };
    });

    const provider = getProvider();
    const response = await provider.complete({
      messages: chatHistory,
      maxTokens: 1024,
    });

    const assistantMsg: ChatMessageRow = {
      id: randomUUID(),
      role: 'assistant',
      content: response,
      provider: provider.name,
      createdAt: new Date().toISOString(),
    };

    // Save both messages only after LLM succeeds
    const insertMsg = db.prepare(
      'INSERT INTO chat_messages (id, role, content, provider, createdAt) VALUES (?, ?, ?, ?, ?)'
    );
    insertMsg.run(userMsg.id, userMsg.role, userMsg.content, userMsg.provider, userMsg.createdAt);
    insertMsg.run(assistantMsg.id, assistantMsg.role, assistantMsg.content, assistantMsg.provider, assistantMsg.createdAt);

    return c.json({ userMessage: userMsg, assistantMessage: assistantMsg });
  } catch (error) {
    console.error('Chat error:', error);
    return c.json({ error: 'Failed to get response' }, 500);
  }
});

// DELETE /api/chat — clear all chat history
app.delete('/', (c) => {
  db.prepare('DELETE FROM chat_messages').run();
  return c.json({ ok: true });
});

export default app;
