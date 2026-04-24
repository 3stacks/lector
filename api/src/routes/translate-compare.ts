import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { streamSSE } from 'hono/streaming';
import { getAllProviders } from '../lib/llm';
import { db, TranslationEvaluationRow } from '../db';
import { randomUUID } from 'crypto';
import { getSpelreelsContext } from '../lib/spelreels';

const app = new Hono();

// Simple token auth for eval endpoints exposed via ngrok
const evalAuth = async (c: Context, next: Next) => {
  const token = process.env.EVAL_TOKEN;
  if (!token) return next(); // No token configured = no auth required

  const provided =
    c.req.header('X-Eval-Token') ||
    c.req.query('token');

  if (provided !== token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  return next();
};

app.use('*', evalAuth);

// POST /api/translate-compare/compare
app.post('/compare', async (c) => {
  try {
    const { sentence } = await c.req.json();

    if (!sentence) {
      return c.json({ error: 'Sentence is required' }, 400);
    }

    const spelreels = getSpelreelsContext();

    const jsonPrompt = `You are an Afrikaans to English translator with deep knowledge of Afrikaans orthography.

Use the following official spelling rules to inform your understanding of the Afrikaans input:

${spelreels}

---

Translate the following Afrikaans sentence into natural English.

Sentence: "${sentence}"

Respond with ONLY a JSON object in this exact format (no markdown, no code blocks):
{"translation": "the natural English translation"}`;

    const plainPrompt = `You are an Afrikaans to English translator. Translate the following Afrikaans phrase, using the sentence context to determine the correct meaning.

Phrase: "${sentence}"
Sentence context: "${sentence}"

Respond with ONLY a JSON object in this exact format (no markdown, no code blocks):
{"translation": "the natural English translation", "literalBreakdown": "word-by-word literal translation", "idiomaticMeaning": "explanation if this is an idiom or has special meaning"}

Include literalBreakdown if the phrase is more than one word.
Include idiomaticMeaning only if the phrase is an idiom or has a meaning that differs from the literal translation.`;

    const providers = getAllProviders();
    const providerEntries = Object.entries(providers);

    const results = await Promise.allSettled(
      providerEntries.map(async ([name, provider]) => {
        // Apfel (Apple model) uses the same prompt as the reader's translate route
        const prompt = name === 'apfel' ? plainPrompt : jsonPrompt;
        const text = await provider.complete({
          messages: [{ role: 'user', content: prompt }],
          maxTokens: 512,
        });
        try {
          const parsed = JSON.parse(text);
          return parsed.translation || text;
        } catch {
          return text;
        }
      })
    );

    const translations: Record<string, { translation: string | null; error: string | null }> = {};
    for (let i = 0; i < results.length; i++) {
      const [name] = providerEntries[i];
      const result = results[i];
      if (result.status === 'fulfilled') {
        translations[name] = { translation: result.value, error: null };
      } else {
        translations[name] = { translation: null, error: result.reason?.message || 'Failed' };
      }
    }

    return c.json({ sentence, translations });
  } catch (error) {
    console.error('Compare error:', error);
    return c.json(
      { error: error instanceof Error ? error.message : 'Comparison failed' },
      500
    );
  }
});

// POST /api/translate-compare/evaluate
app.post('/evaluate', async (c) => {
  try {
    const body = await c.req.json();
    const {
      inputSentence,
      contextSentence,
      apfelTranslation,
      ollamaTranslation,
      claudeTranslation,
      selectedProvider,
      manualTranslation,
    } = body;

    if (!inputSentence || !selectedProvider) {
      return c.json({ error: 'inputSentence and selectedProvider are required' }, 400);
    }

    if (!['apfel', 'ollama', 'claude', 'manual'].includes(selectedProvider)) {
      return c.json({ error: 'Invalid selectedProvider' }, 400);
    }

    if (selectedProvider === 'manual' && !manualTranslation) {
      return c.json({ error: 'manualTranslation required when selectedProvider is manual' }, 400);
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO translation_evaluations
        (id, inputSentence, contextSentence, apfelTranslation, ollamaTranslation, claudeTranslation, selectedProvider, manualTranslation, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, inputSentence, contextSentence || null, apfelTranslation || null, ollamaTranslation || null, claudeTranslation || null, selectedProvider, manualTranslation || null, now);

    return c.json({ id, createdAt: now });
  } catch (error) {
    console.error('Evaluate error:', error);
    return c.json(
      { error: error instanceof Error ? error.message : 'Evaluation failed' },
      500
    );
  }
});

// GET /api/translate-compare/evaluations
app.get('/evaluations', async (c) => {
  const format = c.req.query('format') || 'json';

  const rows = db.prepare(
    'SELECT * FROM translation_evaluations ORDER BY createdAt DESC'
  ).all() as TranslationEvaluationRow[];

  if (format === 'corpus') {
    // Export as RAG corpus format matching issue #25
    const corpus = rows.map((row) => {
      const bestTranslation =
        row.selectedProvider === 'manual'
          ? row.manualTranslation
          : row[`${row.selectedProvider}Translation` as keyof TranslationEvaluationRow];

      return {
        afrikaans: row.inputSentence,
        english: bestTranslation,
        literal: null,
        category: 'evaluated',
        example_sentence: row.inputSentence,
        example_translation: bestTranslation,
      };
    });
    return c.json(corpus);
  }

  return c.json({ evaluations: rows, count: rows.length });
});

// GET /api/translate-compare/random-sentence
app.get('/random-sentence', async (c) => {
  const row = db.prepare(
    'SELECT sentence, translation FROM clozeSentences ORDER BY RANDOM() LIMIT 1'
  ).get() as { sentence: string; translation: string } | undefined;

  if (!row) {
    return c.json({ error: 'No sentences available' }, 404);
  }

  return c.json({ sentence: row.sentence, referenceTranslation: row.translation });
});

// GET /api/translate-compare/auto-evaluate/status
app.get('/auto-evaluate/status', async (c) => {
  const total = (db.prepare(
    'SELECT COUNT(*) as count FROM clozeSentences WHERE (blacklisted = 0 OR blacklisted IS NULL)'
  ).get() as { count: number }).count;

  const evaluated = (db.prepare(
    `SELECT COUNT(*) as count FROM clozeSentences cs
     WHERE (cs.blacklisted = 0 OR cs.blacklisted IS NULL)
       AND cs.sentence IN (SELECT inputSentence FROM translation_evaluations)`
  ).get() as { count: number }).count;

  return c.json({ total, evaluated, remaining: total - evaluated });
});

// POST /api/translate-compare/auto-evaluate
// Claude evaluates Ollama's translations in batch, streaming progress via SSE
// Processes all unevaluated sentences sequentially, resumable across runs
app.post('/auto-evaluate', async (c) => {
  const { batchSize = 50 } = await c.req.json();
  const size = Math.min(Math.max(1, batchSize), 500);

  // Get next batch of unevaluated sentences, ordered by wordRank (most common first)
  const sentences = db.prepare(`
    SELECT cs.sentence, cs.translation AS referenceTranslation, cs.wordRank
    FROM clozeSentences cs
    WHERE (cs.blacklisted = 0 OR cs.blacklisted IS NULL)
      AND cs.sentence NOT IN (SELECT inputSentence FROM translation_evaluations)
    ORDER BY cs.wordRank ASC NULLS LAST, cs.sentence ASC
    LIMIT ?
  `).all(size) as { sentence: string; referenceTranslation: string; wordRank: number | null }[];

  if (sentences.length === 0) {
    return c.json({ error: 'No unevaluated sentences remaining' }, 404);
  }

  // Build providers
  const providers = getAllProviders();
  const ollama = providers.ollama;
  const claude = providers.claude;
  const spelreels = getSpelreelsContext();

  const translatePrompt = (sentence: string) =>
    `You are an Afrikaans to English translator with deep knowledge of Afrikaans orthography.

Use the following official spelling rules to inform your understanding of the Afrikaans input:

${spelreels}

---

Translate the following Afrikaans sentence into natural English.

Sentence: "${sentence}"

Respond with ONLY a JSON object in this exact format (no markdown, no code blocks):
{"translation": "the natural English translation"}`;

  const judgePrompt = (sentence: string, ollamaTranslation: string, referenceTranslation: string) =>
    `You are a translation quality judge for Afrikaans to English, with expert knowledge of Afrikaans spelling and orthography.

Use the following official Afrikaans spelling rules (AWS 7.2) to inform your evaluation:

${spelreels}

---

Afrikaans sentence: "${sentence}"
Reference translation: "${referenceTranslation}"
Translation to evaluate: "${ollamaTranslation}"

Score the translation 1-5:
1 = completely wrong
2 = captures some meaning but significant errors
3 = understandable but awkward or partially wrong
4 = good, minor issues only
5 = excellent, matches or improves on the reference

Pay special attention to whether the translator correctly understood:
- Compound words (los of vas — separate vs joined)
- Hyphenation rules (koppeltekens)
- Plural forms (meervoudsvorme)
- Diaeresis usage (deeltekens)

If the score is below 4, provide a corrected translation.

Respond with ONLY a JSON object (no markdown, no code blocks):
{"score": 4, "correctedTranslation": null, "notes": "brief explanation"}

If correction is needed:
{"score": 2, "correctedTranslation": "the better translation", "notes": "brief explanation"}`;

  return streamSSE(c, async (stream) => {
    let completed = 0;
    let improved = 0;

    for (const { sentence, referenceTranslation } of sentences) {
      try {
        // Step 1: Ollama translates
        let ollamaTranslation: string | null = null;
        try {
          const ollamaRaw = await ollama.complete({
            messages: [{ role: 'user', content: translatePrompt(sentence) }],
            maxTokens: 512,
          });
          try {
            const parsed = JSON.parse(ollamaRaw);
            ollamaTranslation = parsed.translation || ollamaRaw;
          } catch {
            ollamaTranslation = ollamaRaw;
          }
        } catch {
          ollamaTranslation = null;
        }

        // Step 2: Claude judges
        const judgeRaw = await claude.complete({
          messages: [{
            role: 'user',
            content: judgePrompt(sentence, ollamaTranslation || '(failed to translate)', referenceTranslation),
          }],
          maxTokens: 512,
        });

        let score = 0;
        let correctedTranslation: string | null = null;
        let claudeTranslation: string | null = null;
        let notes: string | null = null;
        try {
          const judgeResult = JSON.parse(judgeRaw);
          score = judgeResult.score;
          correctedTranslation = judgeResult.correctedTranslation || null;
          notes = judgeResult.notes || null;
        } catch {
          // If Claude didn't return valid JSON, skip
          completed++;
          await stream.writeSSE({
            data: JSON.stringify({ type: 'progress', completed, total: sentences.length, sentence, status: 'error', error: 'Claude returned invalid JSON' }),
          });
          continue;
        }

        // Determine best translation and provider
        let selectedProvider: string;
        let manualTranslation: string | null = null;

        if (score >= 4) {
          // Ollama was good enough
          selectedProvider = 'ollama';
          claudeTranslation = correctedTranslation;
        } else if (correctedTranslation) {
          // Claude provided a correction — store as manual (Claude-generated)
          selectedProvider = 'manual';
          manualTranslation = correctedTranslation;
          claudeTranslation = correctedTranslation;
          improved++;
        } else {
          // Low score but no correction — use reference
          selectedProvider = 'manual';
          manualTranslation = referenceTranslation;
          claudeTranslation = null;
          improved++;
        }

        // Store evaluation
        const id = randomUUID();
        const now = new Date().toISOString();

        db.prepare(`
          INSERT INTO translation_evaluations
            (id, inputSentence, contextSentence, apfelTranslation, ollamaTranslation, claudeTranslation, selectedProvider, manualTranslation, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, sentence, referenceTranslation, null, ollamaTranslation, claudeTranslation, selectedProvider, manualTranslation, now);

        completed++;
        await stream.writeSSE({
          data: JSON.stringify({
            type: 'progress',
            completed,
            total: sentences.length,
            sentence,
            ollamaTranslation,
            score,
            correctedTranslation,
            notes,
            selectedProvider,
            status: 'ok',
          }),
        });
      } catch (err) {
        completed++;
        await stream.writeSSE({
          data: JSON.stringify({
            type: 'progress',
            completed,
            total: sentences.length,
            sentence,
            status: 'error',
            error: err instanceof Error ? err.message : 'Unknown error',
          }),
        });
      }
    }

    await stream.writeSSE({
      data: JSON.stringify({
        type: 'done',
        completed,
        improved,
        total: sentences.length,
      }),
    });
  });
});

export default app;
