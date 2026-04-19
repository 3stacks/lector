import fs from 'fs';
import path from 'path';
import os from 'os';

export interface LectorConfig {
  apiUrl: string;
  token?: string;
  format?: 'json' | 'table';
}

const DEFAULT_CONFIG: LectorConfig = {
  apiUrl: 'http://localhost:3457',
  format: 'table',
};

function getConfigDir(): string {
  return path.join(os.homedir(), '.config', 'lector');
}

function getConfigPath(): string {
  return path.join(getConfigDir(), 'config.json');
}

export function loadConfig(): LectorConfig {
  const configPath = getConfigPath();
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(content) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: LectorConfig): void {
  const dir = getConfigDir();
  fs.mkdirSync(dir, { recursive: true });
  const configPath = getConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  fs.chmodSync(configPath, 0o600);
}

export function maskToken(token: string): string {
  if (token.length <= 8) return '****';
  return token.slice(0, 8) + '...' + token.slice(-4);
}
