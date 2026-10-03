type LogLevel = 'info' | 'warn' | 'error';

export function log(level: LogLevel, event: string, details: Record<string, unknown> = {}): void {
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    event,
    ...details,
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}
