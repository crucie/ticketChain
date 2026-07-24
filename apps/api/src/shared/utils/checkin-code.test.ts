import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CHECKIN_CODE_LENGTH,
  formatCheckinCode,
  generateCheckinCode,
  isValidCheckinCodeFormat,
  normalizeCheckinCode,
} from './checkin-code.js';

describe('checkin-code', () => {
  it('generates 9-char codes from the ambiguous-free alphabet', () => {
    const code = generateCheckinCode();
    assert.equal(code.length, CHECKIN_CODE_LENGTH);
    assert.equal(isValidCheckinCodeFormat(code), true);
  });

  it('normalizes spaces and dashes', () => {
    assert.equal(normalizeCheckinCode('abC-def-gh2'), 'ABCDEFGH2');
  });

  it('formats as XXX-XXX-XXX', () => {
    assert.equal(formatCheckinCode('ABCDEFGH2'), 'ABC-DEF-GH2');
  });

  it('rejects invalid formats', () => {
    assert.equal(isValidCheckinCodeFormat('SHORT'), false);
    assert.equal(isValidCheckinCodeFormat('ABCDEFGHI'), false); // I not in alphabet
  });
});
