import { log } from '~/utils/system/logging';

export interface ConnectionError {
  code: string;
  message: string;
  address?: string;
  port?: number;
}

export function categorizeConnectionError(
  error: Error & { code?: string; errno?: string },
  peerId: string
): 'retry' | 'blacklist' | 'ignore' {
  const errorCode = error.code || error.errno;

  switch (errorCode) {
    case 'ECONNREFUSED':
      log('debug', `${peerId}: Connection refused (peer offline or port closed)`);
      return 'retry'; // Peut être temporaire

    case 'ETIMEDOUT':
      log('warn', `${peerId}: Connection timeout (slow network or peer busy)`);
      return 'retry'; // Peut être temporaire

    case 'ECONNRESET':
      log('debug', `${peerId}: Connection reset (peer disconnected)`);
      return 'retry'; // Peut être temporaire

    case 'EHOSTUNREACH':
      log('debug', `${peerId}: Host unreachable (routing issue)`);
      return 'blacklist'; // Problème réseau persistant

    case 'ENETUNREACH':
      log('debug', `${peerId}: Network unreachable (no route)`);
      return 'blacklist'; // Problème réseau persistant

    case 'ENOTFOUND':
      log('debug', `${peerId}: Host not found (DNS issue)`);
      return 'blacklist'; // Adresse invalide

    case 'EADDRINUSE':
      log('warn', `${peerId}: Address in use (port conflict)`);
      return 'ignore'; // Problème local

    case 'EMFILE':
    case 'ENFILE':
      log('warn', `${peerId}: Too many open files (system limit)`);
      return 'ignore'; // Problème système local

    default:
      log('debug', `${peerId}: Unknown connection error (${errorCode}): ${error.message}`);
      return 'retry'; // Par défaut, on retry
  }
}

export function shouldRetryError(
  errorCode: string,
  attemptCount: number,
  maxAttempts: number
): boolean {
  // Erreurs qu'on ne retry jamais après la première tentative
  const noRetryErrors = ['EHOSTUNREACH', 'ENETUNREACH', 'ENOTFOUND'];

  if (noRetryErrors.includes(errorCode)) {
    return false;
  }

  // Erreurs temporaires qu'on peut retry plusieurs fois
  const retryableErrors = ['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET'];

  if (retryableErrors.includes(errorCode) && attemptCount < maxAttempts) {
    return true;
  }

  return false;
}

export function getRetryDelay(attemptCount: number): number {
  // Backoff exponentiel : 1s, 2s, 4s, 8s, max 30s
  const baseDelay = 1000;
  const maxDelay = 30000;

  const delay = Math.min(baseDelay * Math.pow(2, attemptCount - 1), maxDelay);

  // Ajouter une variation aléatoire pour éviter thundering herd
  const jitter = Math.random() * 0.3 + 0.85; // 85-115% du délai

  return Math.floor(delay * jitter);
}
