#!/usr/bin/env bun
import { loadConfig } from './config';
import { ApiClient } from './client';
import { output, type Format } from './format';

import * as auth from './commands/auth';
import * as collections from './commands/collections';
import * as lessons from './commands/lessons';
import * as vocab from './commands/vocab';
import * as cloze from './commands/cloze';
import * as stats from './commands/stats';
import * as settings from './commands/settings';
import * as data from './commands/data';
import * as tokens from './commands/tokens';

const COMMANDS: Record<string, { handle: typeof auth.handle; description: string }> = {
  auth:        { handle: auth.handle,        description: 'Configure API access (login, logout, status, verify)' },
  collections: { handle: collections.handle, description: 'Manage collections (list, get, create, update, delete, lessons, add-lesson)' },
  lessons:     { handle: lessons.handle,     description: 'Manage lessons (get, update, delete, progress)' },
  vocab:       { handle: vocab.handle,       description: 'Manage vocabulary (list, get, create, update, delete)' },
  cloze:       { handle: cloze.handle,       description: 'Manage cloze sentences (list, due, counts, get, review, delete)' },
  stats:       { handle: stats.handle,       description: 'View and update stats (today, range, streak, increment)' },
  settings:    { handle: settings.handle,    description: 'Manage settings (list, get, set, delete)' },
  data:        { handle: data.handle,        description: 'Export and import data (export, import)' },
  tokens:      { handle: tokens.handle,      description: 'Manage API tokens (list, create, revoke)' },
};

function parseArgs(args: string[]): {
  resource: string;
  action: string;
  positional: string[];
  flags: Record<string, string>;
} {
  const flags: Record<string, string> = {};
  const positional: string[] = [];

  let i = 0;
  // First two positional args are resource and action
  const resource = args[i++] || '';
  const action = args[i++] || '';

  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      // Boolean flags (no value following, or next arg is also a flag)
      if (!next || next.startsWith('--')) {
        flags[key] = 'true';
      } else {
        flags[key] = next;
        i++;
      }
    } else {
      positional.push(arg);
    }
    i++;
  }

  return { resource, action, positional, flags };
}

function printHelp(): void {
  console.log('Usage: lector <resource> <action> [id] [--flags]');
  console.log('\nResources:');
  for (const [name, { description }] of Object.entries(COMMANDS)) {
    console.log(`  ${name.padEnd(14)} ${description}`);
  }
  console.log('\nGlobal flags:');
  console.log('  --format     json | table (default: table)');
  console.log('  --api-url    Override API URL');
  console.log('  --token      Override auth token');
  console.log('\nExamples:');
  console.log('  lector collections list');
  console.log('  lector vocab list --state known --format json');
  console.log('  lector tokens create --name "CLI" --scopes "*"');
  console.log('  lector auth login --token ltr_...');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    return;
  }

  const { resource, action, positional, flags } = parseArgs(args);

  if (resource === 'help' || action === 'help') {
    printHelp();
    return;
  }

  const command = COMMANDS[resource];
  if (!command) {
    console.error(`Unknown resource: ${resource}`);
    console.error(`Run 'lector help' for available commands.`);
    process.exit(1);
  }

  if (!action) {
    console.error(`Missing action for ${resource}.`);
    console.error(`Run 'lector ${resource} help' for available actions.`);
    process.exit(1);
  }

  // Build config with flag overrides
  const config = loadConfig();
  const apiUrl = flags['api-url'] || config.apiUrl;
  const token = flags.token || config.token;
  const format: Format = (flags.format as Format) || config.format || 'table';

  const client = new ApiClient(apiUrl, token);
  const id = positional[0];

  try {
    await command.handle(client, action, id, flags, format);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${msg}`);
    process.exit(1);
  }
}

main();
