import { randomBytes } from 'crypto';

/** Ambiguous-free alphabet (no 0/O/1/I/L) for gate backup codes. */
export const CHECKIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CHECKIN_CODE_LENGTH = 9;

export function generateCheckinCode(): string {
  const bytes = randomBytes(CHECKIN_CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CHECKIN_CODE_LENGTH; i++) {
    code += CHECKIN_CODE_ALPHABET[bytes[i]! % CHECKIN_CODE_ALPHABET.length];
  }
  return code;
}

export function generateCheckinCodes(count: number): string[] {
  return Array.from({ length: count }, () => generateCheckinCode());
}

/** Normalize user/volunteer input: strip spaces/dashes, uppercase. */
export function normalizeCheckinCode(raw: string): string {
  return raw.replace(/[\s\-]/g, '').toUpperCase();
}

export function isValidCheckinCodeFormat(code: string): boolean {
  if (code.length !== CHECKIN_CODE_LENGTH) return false;
  for (const ch of code) {
    if (!CHECKIN_CODE_ALPHABET.includes(ch)) return false;
  }
  return true;
}

/** Display as XXX-XXX-XXX for readability. */
export function formatCheckinCode(code: string): string {
  const normalized = normalizeCheckinCode(code);
  if (normalized.length !== CHECKIN_CODE_LENGTH) return normalized;
  return `${normalized.slice(0, 3)}-${normalized.slice(3, 6)}-${normalized.slice(6, 9)}`;
}
