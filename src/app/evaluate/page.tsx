'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

type Provider = 'apfel' | 'ollama' | 'claude';
type SelectedProvider = Provider | 'manual';

interface TranslationResult {
  translation: string | null;
  error: string | null;
}

interface CompareResponse {
  sentence: string;
  translations: Record<Provider, TranslationResult>;
}

interface Evaluation {
  id: string;
  inputSentence: string;
  selectedProvider: SelectedProvider;
  manualTranslation: string | null;
  apfelTranslation: string | null;
  ollamaTranslation: string | null;
  claudeTranslation: string | null;
  createdAt: string;
}

const PROVIDER_LABELS: Record<Provider, string> = {
  apfel: 'Apfel',
  ollama: 'Ollama',
  claude: 'Claude',
};

const PROVIDER_COLORS: Record<Provider, { ring: string; bg: string; text: string }> = {
  apfel: { ring: 'ring-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-700 dark:text-amber-300' },
  ollama: { ring: 'ring-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/20', text: 'text-purple-700 dark:text-purple-300' },
  claude: { ring: 'ring-sky-500', bg: 'bg-sky-50 dark:bg-sky-900/20', text: 'text-sky-700 dark:text-sky-300' },
};

export default function EvaluatePage() {
  const [token, setToken] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [tokenRequired, setTokenRequired] = useState<boolean | null>(null);

  const [sentence, setSentence] = useState('');
  const [results, setResults] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<SelectedProvider | null>(null);
  const [manualText, setManualText] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [evalCount, setEvalCount] = useState(0);
  const [history, setHistory] = useState<Evaluation[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-evaluate state
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoBatchSize, setAutoBatchSize] = useState(50);
  const [autoStatus, setAutoStatus] = useState<{ total: number; evaluated: number; remaining: number } | null>(null);
  const [autoProgress, setAutoProgress] = useState<{ completed: number; total: number } | null>(null);
  const [autoResults, setAutoResults] = useState<Array<{
    sentence: string;
    ollamaTranslation: string | null;
    score: number;
    correctedTranslation: string | null;
    notes: string | null;
    status: string;
    error?: string;
  }>>([]);
  const [autoSummary, setAutoSummary] = useState<{ completed: number; improved: number; total: number } | null>(null);
  const [showAuto, setShowAuto] = useState(false);
  const autoAbortRef = useRef<AbortController | null>(null);

  const headers = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h['X-Eval-Token'] = token;
    return h;
  }, [token]);

  // Check if auth is required
  useEffect(() => {
    fetch('/api/translate-compare?type=random')
      .then((r) => {
        if (r.status === 401) {
          setTokenRequired(true);
        } else {
          setTokenRequired(false);
          setAuthenticated(true);
        }
      })
      .catch(() => setTokenRequired(true));
  }, []);

  const authenticate = async () => {
    const res = await fetch('/api/translate-compare?type=random', {
      headers: { 'X-Eval-Token': token },
    });
    if (res.ok) {
      setAuthenticated(true);
    } else {
      setError('Invalid token');
    }
  };

  const fetchRandomSentence = async () => {
    setError(null);
    try {
      const res = await fetch('/api/translate-compare?type=random', { headers: headers() });
      if (!res.ok) throw new Error('Failed to fetch sentence');
      const data = await res.json();
      setSentence(data.sentence);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch sentence');
    }
  };

  const compare = async () => {
    if (!sentence.trim()) return;
    setLoading(true);
    setResults(null);
    setSelected(null);
    setShowManual(false);
    setManualText('');
    setSubmitted(false);
    setError(null);

    try {
      const res = await fetch('/api/translate-compare', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ action: 'compare', sentence: sentence.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Comparison failed');
      }

      const data: CompareResponse = await res.json();
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Comparison failed');
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    if (!results) return;
    if (showManual && !manualText.trim()) return;
    if (!showManual && !selected) return;

    setSubmitting(true);
    setError(null);

    const provider = showManual ? 'manual' : selected;

    try {
      const res = await fetch('/api/translate-compare', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          action: 'evaluate',
          inputSentence: results.sentence,
          apfelTranslation: results.translations.apfel?.translation || null,
          ollamaTranslation: results.translations.ollama?.translation || null,
          claudeTranslation: results.translations.claude?.translation || null,
          selectedProvider: provider,
          manualTranslation: showManual ? manualText.trim() : null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Submission failed');
      }

      setSubmitted(true);
      setEvalCount((c) => c + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const next = () => {
    setResults(null);
    setSelected(null);
    setShowManual(false);
    setManualText('');
    setSubmitted(false);
    setSentence('');
    fetchRandomSentence();
  };

  const fetchAutoStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/translate-compare?type=auto-status', { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        setAutoStatus(data);
      }
    } catch {
      // ignore
    }
  }, [headers]);

  const startAutoEvaluate = async () => {
    setAutoRunning(true);
    setAutoResults([]);
    setAutoSummary(null);
    setAutoProgress(null);
    setError(null);

    const controller = new AbortController();
    autoAbortRef.current = controller;

    try {
      const res = await fetch('/api/translate-compare', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ action: 'auto-evaluate', batchSize: autoBatchSize }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Auto-evaluate failed');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const jsonStr = line.slice(5).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);
            if (event.type === 'progress') {
              setAutoProgress({ completed: event.completed, total: event.total });
              setAutoResults((prev) => [...prev, event]);
            } else if (event.type === 'done') {
              setAutoSummary(event);
            }
          } catch {
            // Skip malformed SSE lines
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : 'Auto-evaluate failed');
      }
    } finally {
      setAutoRunning(false);
      autoAbortRef.current = null;
      fetchAutoStatus();
    }
  };

  const stopAutoEvaluate = () => {
    autoAbortRef.current?.abort();
  };

  const loadHistory = async () => {
    try {
      const res = await fetch('/api/translate-compare?type=evaluations', { headers: headers() });
      if (!res.ok) throw new Error('Failed to load history');
      const data = await res.json();
      setHistory(data.evaluations);
      setShowHistory(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    }
  };

  // Auth gate
  if (tokenRequired === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="text-zinc-500 dark:text-zinc-400">Loading...</div>
      </div>
    );
  }

  if (tokenRequired && !authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4">
        <div className="w-full max-w-sm space-y-4">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 text-center">
            Lector Eval
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-center text-sm">
            Enter the access token to continue
          </p>
          {error && (
            <div className="text-red-600 dark:text-red-400 text-sm text-center">{error}</div>
          )}
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && authenticate()}
            placeholder="Access token"
            className="w-full px-4 py-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            autoFocus
          />
          <button
            onClick={authenticate}
            className="w-full px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-zinc-900/80 backdrop-blur border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            Lector Eval
          </h1>
          <div className="flex items-center gap-3">
            {evalCount > 0 && (
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                {evalCount} evaluated
              </span>
            )}
            <button
              onClick={loadHistory}
              className="text-sm px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors"
            >
              History
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {error && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Input section */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Afrikaans sentence
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={sentence}
              onChange={(e) => setSentence(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !loading && compare()}
              placeholder="Type an Afrikaans sentence..."
              className="flex-1 px-4 py-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={loading}
            />
            <button
              onClick={fetchRandomSentence}
              disabled={loading}
              className="px-4 py-3 rounded-xl border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors disabled:opacity-50 flex-shrink-0"
              title="Random sentence from Tatoeba bank"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
          <button
            onClick={compare}
            disabled={loading || !sentence.trim()}
            className="w-full px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 text-white font-medium transition-colors disabled:cursor-not-allowed"
          >
            {loading ? 'Translating with all 3 providers...' : 'Compare Translations'}
          </button>
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {(['apfel', 'ollama', 'claude'] as Provider[]).map((p) => (
              <div
                key={p}
                className="p-5 rounded-xl border-2 border-zinc-200 dark:border-zinc-700 animate-pulse"
              >
                <div className="h-5 w-20 bg-zinc-200 dark:bg-zinc-700 rounded mb-3" />
                <div className="h-4 w-full bg-zinc-200 dark:bg-zinc-700 rounded mb-2" />
                <div className="h-4 w-3/4 bg-zinc-200 dark:bg-zinc-700 rounded" />
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {results && !loading && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Select the best translation, or write your own below.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(['apfel', 'ollama', 'claude'] as Provider[]).map((provider) => {
                const result = results.translations[provider];
                const isSelected = selected === provider && !showManual;
                const colors = PROVIDER_COLORS[provider];
                const hasError = !!result?.error;
                const isDisabled = hasError || submitted;

                return (
                  <button
                    key={provider}
                    onClick={() => {
                      if (isDisabled) return;
                      setSelected(provider);
                      setShowManual(false);
                    }}
                    disabled={isDisabled}
                    className={`
                      p-5 rounded-xl border-2 text-left transition-all
                      ${isSelected
                        ? `${colors.ring.replace('ring', 'border')} ${colors.bg} ring-2 ${colors.ring} ring-offset-2 ring-offset-white dark:ring-offset-zinc-950`
                        : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'
                      }
                      ${isDisabled && !isSelected ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                      ${submitted && isSelected ? 'ring-2 ring-green-500 border-green-500' : ''}
                    `}
                  >
                    <div className={`text-sm font-semibold mb-2 ${isSelected ? colors.text : 'text-zinc-500 dark:text-zinc-400'}`}>
                      {PROVIDER_LABELS[provider]}
                    </div>
                    {hasError ? (
                      <p className="text-sm text-red-500 dark:text-red-400 italic">
                        {result.error}
                      </p>
                    ) : (
                      <p className="text-zinc-800 dark:text-zinc-200 leading-relaxed">
                        {result?.translation || 'No translation'}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Manual fallback */}
            {!submitted && (
              <div className="space-y-3">
                {!showManual ? (
                  <button
                    onClick={() => {
                      setShowManual(true);
                      setSelected(null);
                    }}
                    className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    None of these are good enough — I&apos;ll write my own
                  </button>
                ) : (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Your translation
                    </label>
                    <textarea
                      value={manualText}
                      onChange={(e) => setManualText(e.target.value)}
                      placeholder="Type the correct English translation..."
                      rows={3}
                      className="w-full px-4 py-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                      autoFocus
                    />
                    <button
                      onClick={() => {
                        setShowManual(false);
                        setManualText('');
                      }}
                      className="text-sm text-zinc-500 dark:text-zinc-400 hover:underline"
                    >
                      Cancel — pick from above instead
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Submit */}
            {!submitted && (selected || (showManual && manualText.trim())) && (
              <button
                onClick={submit}
                disabled={submitting}
                className="w-full px-4 py-3 rounded-xl bg-green-600 hover:bg-green-700 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 text-white font-medium transition-colors"
              >
                {submitting
                  ? 'Saving...'
                  : showManual
                    ? 'Submit my translation'
                    : `Select ${PROVIDER_LABELS[selected as Provider]} as best`
                }
              </button>
            )}

            {/* Success + next */}
            {submitted && (
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 text-sm text-center">
                  Saved! Evaluation recorded.
                </div>
                <button
                  onClick={next}
                  className="w-full px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors"
                >
                  Next sentence
                </button>
              </div>
            )}
          </div>
        )}

        {/* Auto-evaluate section */}
        <div className="border-t border-zinc-200 dark:border-zinc-800 pt-6">
          <button
            onClick={() => {
              const next = !showAuto;
              setShowAuto(next);
              if (next) fetchAutoStatus();
            }}
            className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            <svg
              className={`w-4 h-4 transition-transform ${showAuto ? 'rotate-90' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            Auto-evaluate with Claude
            {autoStatus && (
              <span className="text-xs text-zinc-400 dark:text-zinc-500 font-normal">
                {autoStatus.evaluated}/{autoStatus.total} done, {autoStatus.remaining} remaining
              </span>
            )}
          </button>

          {showAuto && (
            <div className="mt-4 space-y-4">
              <div className="flex items-end gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                    Batch size
                  </label>
                  <select
                    value={autoBatchSize}
                    onChange={(e) => setAutoBatchSize(Number(e.target.value))}
                    disabled={autoRunning}
                    className="px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-sm"
                  >
                    {[50, 100, 200, 500].map((n) => (
                      <option key={n} value={n}>{n} sentences</option>
                    ))}
                  </select>
                </div>
                {!autoRunning ? (
                  <button
                    onClick={startAutoEvaluate}
                    className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium transition-colors"
                  >
                    Run auto-evaluation
                  </button>
                ) : (
                  <button
                    onClick={stopAutoEvaluate}
                    className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
                  >
                    Stop
                  </button>
                )}
              </div>

              {/* Progress bar */}
              {autoProgress && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
                    <span>{autoProgress.completed} / {autoProgress.total}</span>
                    <span>{Math.round((autoProgress.completed / autoProgress.total) * 100)}%</span>
                  </div>
                  <div className="h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-sky-500 transition-all duration-300 rounded-full"
                      style={{ width: `${(autoProgress.completed / autoProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Summary */}
              {autoSummary && (
                <div className="p-3 rounded-lg bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 text-sm">
                  <p className="font-medium text-sky-700 dark:text-sky-300">
                    Batch complete: {autoSummary.completed} evaluated, {autoSummary.improved} corrected by Claude
                  </p>
                  <p className="text-sky-600 dark:text-sky-400 mt-1">
                    {autoSummary.completed - autoSummary.improved} sentences where Ollama was good (score 4+)
                  </p>
                </div>
              )}

              {/* Results feed */}
              {autoResults.length > 0 && (
                <div className="max-h-96 overflow-y-auto space-y-2">
                  {autoResults.map((r, i) => (
                    <div
                      key={i}
                      className={`p-3 rounded-lg border text-sm ${
                        r.status === 'error'
                          ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
                          : r.score >= 4
                            ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20'
                            : 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20'
                      }`}
                    >
                      <p className="font-medium text-zinc-800 dark:text-zinc-200">{r.sentence}</p>
                      {r.status === 'error' ? (
                        <p className="text-red-600 dark:text-red-400 mt-1">{r.error}</p>
                      ) : (
                        <>
                          <div className="mt-1 flex items-center gap-2">
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                              r.score >= 4
                                ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                                : r.score >= 3
                                  ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                                  : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                            }`}>
                              {r.score}/5
                            </span>
                            <span className="text-zinc-500 dark:text-zinc-400">
                              Ollama: {r.ollamaTranslation || '(failed)'}
                            </span>
                          </div>
                          {r.correctedTranslation && (
                            <p className="mt-1 text-sky-700 dark:text-sky-300">
                              Claude: {r.correctedTranslation}
                            </p>
                          )}
                          {r.notes && (
                            <p className="mt-0.5 text-zinc-400 dark:text-zinc-500 text-xs">{r.notes}</p>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* History panel */}
        {showHistory && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4">
            <div className="bg-white dark:bg-zinc-900 rounded-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
                <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
                  Evaluation History ({history.length})
                </h2>
                <button
                  onClick={() => setShowHistory(false)}
                  className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="overflow-y-auto flex-1 divide-y divide-zinc-100 dark:divide-zinc-800">
                {history.length === 0 ? (
                  <p className="p-6 text-center text-zinc-500 dark:text-zinc-400">
                    No evaluations yet
                  </p>
                ) : (
                  history.map((ev) => {
                    const bestTranslation =
                      ev.selectedProvider === 'manual'
                        ? ev.manualTranslation
                        : ev[`${ev.selectedProvider}Translation` as keyof Evaluation];
                    return (
                      <div key={ev.id} className="px-4 py-3 space-y-1">
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {ev.inputSentence}
                        </p>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          {bestTranslation as string}
                        </p>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            ev.selectedProvider === 'manual'
                              ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                              : `${PROVIDER_COLORS[ev.selectedProvider as Provider]?.bg || ''} ${PROVIDER_COLORS[ev.selectedProvider as Provider]?.text || ''}`
                          }`}>
                            {ev.selectedProvider === 'manual' ? 'Manual' : PROVIDER_LABELS[ev.selectedProvider as Provider]}
                          </span>
                          <span className="text-xs text-zinc-400 dark:text-zinc-500">
                            {new Date(ev.createdAt).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
