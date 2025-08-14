function getTimestamp(): string {
  const now = new Date();
  return `[${now.toISOString().split('T')[1]?.split('.')[0]}]`;
}

export function log(level: 'info' | 'warn' | 'fail' | 'pass' | 'debug', message: string) {
  if (Bun.env.NODE_ENV === 'production' && level === 'debug') {
    return;
  }
  const colors = {
    info: '\x1b[36m', // Cyan
    warn: '\x1b[33m', // Yellow
    fail: '\x1b[31m', // Red
    pass: '\x1b[32m', // Green
    debug: '\x1b[90m', // Gray
  };
  const reset = '\x1b[0m';
  const levelStr = level.toUpperCase().padEnd(7).padStart(7);
  console.log(`${getTimestamp()} ${colors[level]}${levelStr}${reset} ${message}`);
}
