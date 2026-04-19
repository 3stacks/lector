import { createMiddleware } from 'hono/factory';
import { createHash, timingSafeEqual } from 'crypto';
import { db, ApiTokenRow } from '../db';

const SCOPE_MAP: Record<string, { read: string; write: string }> = {
  collections:     { read: 'collections:read', write: 'collections:write' },
  lessons:         { read: 'collections:read', write: 'collections:write' },
  vocab:           { read: 'vocab:read',       write: 'vocab:write' },
  'known-words':   { read: 'vocab:read',       write: 'vocab:write' },
  cloze:           { read: 'vocab:read',       write: 'vocab:write' },
  stats:           { read: 'stats:read',       write: 'stats:write' },
  settings:        { read: 'settings:read',    write: 'settings:write' },
  translate:       { read: 'vocab:read',       write: 'vocab:read' },
  explain:         { read: 'vocab:read',       write: 'vocab:read' },
  tts:             { read: 'vocab:read',       write: 'vocab:read' },
  tatoeba:         { read: 'vocab:read',       write: 'vocab:read' },
  anki:            { read: 'settings:read',    write: 'settings:write' },
  'study-ping':    { read: 'stats:read',       write: 'stats:write' },
  data:            { read: 'data:export',      write: 'data:import' },
  'extract-url':   { read: 'collections:write', write: 'collections:write' },
  import:          { read: 'collections:write', write: 'collections:write' },
  'journal-correct': { read: 'vocab:read',     write: 'vocab:read' },
  'llm-status':    { read: 'settings:read',    write: 'settings:write' },
};

function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

function getRequiredScope(path: string, method: string): string | null {
  // Extract resource from path: /api/<resource>/...
  const segments = path.split('/').filter(Boolean);
  const resource = segments[1]; // segments[0] = 'api'

  if (!resource || resource === 'tokens') return null; // tokens route is unprotected

  const mapping = SCOPE_MAP[resource];
  if (!mapping) return null;

  const isRead = method === 'GET' || method === 'HEAD';
  return isRead ? mapping.read : mapping.write;
}

function tokenHasScope(tokenScopes: string[], requiredScope: string): boolean {
  if (tokenScopes.includes('*')) return true;
  if (tokenScopes.includes(requiredScope)) return true;

  // Check wildcard: 'collections:*' matches 'collections:read'
  const [category] = requiredScope.split(':');
  if (tokenScopes.includes(`${category}:*`)) return true;

  return false;
}

export const authMiddleware = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('Authorization');

  // No auth header = local access, pass through
  if (!authHeader) return next();

  // Must be Bearer token
  if (!authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Invalid authorization format. Use: Bearer <token>' }, 401);
  }

  const token = authHeader.slice(7);
  if (!token) {
    return c.json({ error: 'Missing token' }, 401);
  }

  // Hash the presented token and look it up
  const presentedHash = hashToken(token);
  const rows = db.prepare('SELECT * FROM api_tokens').all() as ApiTokenRow[];

  let matchedToken: ApiTokenRow | null = null;
  for (const row of rows) {
    const storedHash = Buffer.from(row.tokenHash, 'hex');
    if (storedHash.length === presentedHash.length && timingSafeEqual(presentedHash, storedHash)) {
      matchedToken = row;
      break;
    }
  }

  if (!matchedToken) {
    return c.json({ error: 'Invalid token' }, 401);
  }

  // Check expiry
  if (matchedToken.expiresAt && new Date(matchedToken.expiresAt) < new Date()) {
    return c.json({ error: 'Token has expired' }, 401);
  }

  // Check scope
  const requiredScope = getRequiredScope(c.req.path, c.req.method);
  if (requiredScope) {
    const scopes: string[] = JSON.parse(matchedToken.scopes);
    if (!tokenHasScope(scopes, requiredScope)) {
      return c.json({ error: `Insufficient scope. Required: ${requiredScope}` }, 403);
    }
  }

  // Store token info in context for routes that need it
  c.set('tokenId', matchedToken.id);
  c.set('tokenName', matchedToken.name);
  c.set('tokenScopes', JSON.parse(matchedToken.scopes));

  // Update lastUsedAt (non-blocking)
  db.prepare('UPDATE api_tokens SET lastUsedAt = ? WHERE id = ?')
    .run(new Date().toISOString(), matchedToken.id);

  return next();
});
