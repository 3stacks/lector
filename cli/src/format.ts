export type Format = 'json' | 'table';

export function output(data: unknown, format: Format): void {
  if (format === 'json') {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      console.log('(no results)');
      return;
    }
    printTable(data);
  } else if (typeof data === 'object' && data !== null) {
    printKeyValue(data as Record<string, unknown>);
  } else {
    console.log(String(data));
  }
}

function printTable(rows: Record<string, unknown>[]): void {
  const keys = Object.keys(rows[0]);
  const maxWidth = process.stdout.columns || 120;

  // Filter out very long fields
  const displayKeys = keys.filter(k => {
    const sample = String(rows[0][k] ?? '');
    return k !== 'textContent' && sample.length < 500;
  });

  // Calculate column widths
  const widths: Record<string, number> = {};
  for (const key of displayKeys) {
    widths[key] = key.length;
    for (const row of rows) {
      const val = formatValue(row[key]);
      widths[key] = Math.max(widths[key], Math.min(val.length, 40));
    }
  }

  // Truncate columns to fit terminal
  const totalPadding = (displayKeys.length - 1) * 3; // ' | ' separators
  let totalWidth = displayKeys.reduce((sum, k) => sum + widths[k], 0) + totalPadding;
  while (totalWidth > maxWidth && displayKeys.length > 1) {
    // Shrink widest column
    const widest = displayKeys.reduce((a, b) => widths[a] > widths[b] ? a : b);
    widths[widest] = Math.max(widths[widest] - 5, 8);
    totalWidth = displayKeys.reduce((sum, k) => sum + widths[k], 0) + totalPadding;
  }

  // Header
  const header = displayKeys.map(k => pad(k, widths[k])).join(' | ');
  console.log(header);
  console.log(displayKeys.map(k => '-'.repeat(widths[k])).join('-+-'));

  // Rows
  for (const row of rows) {
    const line = displayKeys.map(k => pad(formatValue(row[k]), widths[k])).join(' | ');
    console.log(line);
  }

  console.log(`\n${rows.length} result${rows.length === 1 ? '' : 's'}`);
}

function printKeyValue(obj: Record<string, unknown>): void {
  const maxKeyLen = Math.max(...Object.keys(obj).map(k => k.length));
  for (const [key, value] of Object.entries(obj)) {
    const val = formatValue(value);
    const display = val.length > 200 ? val.slice(0, 200) + '...' : val;
    console.log(`${key.padEnd(maxKeyLen)}  ${display}`);
  }
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function pad(str: string, width: number): string {
  if (str.length > width) return str.slice(0, width - 1) + '…';
  return str.padEnd(width);
}
