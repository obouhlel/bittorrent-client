function getTimestamp(): string {
  const now = new Date();
  return `[${now.toISOString().split('T')[1]?.split('.')[0]}]`;
}

export function log(level: 'info' | 'warn' | 'error' | 'success' | 'debug', message: string) {
  const colors = {
    info: '\x1b[36m', // Cyan
    warn: '\x1b[33m', // Yellow
    error: '\x1b[31m', // Red
    success: '\x1b[32m', // Green
    debug: '\x1b[90m', // Gray
  };
  const reset = '\x1b[0m';
  const levelStr = level.toUpperCase().padEnd(7);
  console.log(`${getTimestamp()} ${colors[level]}${levelStr}${reset} ${message}`);
}
