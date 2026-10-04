/**
 * Phone number and personal identifier masking utilities
 */

export function maskPhone(phone?: string | null): string {
  if (!phone) return '';
  const cleaned = phone.trim();
  if (cleaned.length < 8) return '****';

  // Egyptian format e.g. +201012345678 -> +20 10 **** 5678
  if (cleaned.startsWith('+20')) {
    const carrier = cleaned.slice(3, 5); // 10, 11, 12, 15
    const last4 = cleaned.slice(-4);
    return `+20 ${carrier} **** ${last4}`;
  }

  // Generic international format
  const start = cleaned.slice(0, 4);
  const end = cleaned.slice(-3);
  return `${start} **** ${end}`;
}

export function maskEmail(email?: string | null): string {
  if (!email) return '';
  const [local, domain] = email.split('@');
  if (!domain) return '****';
  const maskedLocal = local && local.length > 2 ? `${local[0]}***${local[local.length - 1]}` : '***';
  return `${maskedLocal}@${domain}`;
}
