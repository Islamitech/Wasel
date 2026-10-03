import { describe, it, expect } from 'vitest';
import { normalizeEgyptianPhone, formatEgp, toArabicDigits } from '../src/index.js';

describe('Shared Package Unit Tests', () => {
  describe('Egyptian Phone Normalization', () => {
    it('normalizes local 010 number to +2010', () => {
      expect(normalizeEgyptianPhone('01012345678')).toBe('+201012345678');
    });

    it('normalizes 011, 012, 015 numbers properly', () => {
      expect(normalizeEgyptianPhone('01112345678')).toBe('+201112345678');
      expect(normalizeEgyptianPhone('01212345678')).toBe('+201212345678');
      expect(normalizeEgyptianPhone('01512345678')).toBe('+201512345678');
    });

    it('handles 0020 prefix', () => {
      expect(normalizeEgyptianPhone('00201012345678')).toBe('+201012345678');
    });

    it('handles with spaces and dashes', () => {
      expect(normalizeEgyptianPhone('010-1234-5678')).toBe('+201012345678');
      expect(normalizeEgyptianPhone('010 1234 5678')).toBe('+201012345678');
    });
  });

  describe('Currency & Number Formatters', () => {
    it('formats EGP currency correctly', () => {
      const formatted = formatEgp(150);
      expect(formatted).toMatch(/١٥٠|150/);
      expect(formatted).toMatch(/ج\.م|EGP/);
    });

    it('converts to eastern Arabic digits', () => {
      expect(toArabicDigits('12345')).toBe('١٢٣٤٥');
    });
  });
});
