/**
 * Format currency in Egyptian Pounds (EGP / ج.م)
 */
export function formatEgp(amount: number, locale: 'ar-EG' | 'en-EG' = 'ar-EG'): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'EGP',
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount} ج.م`;
  }
}

/**
 * Convert Western Arabic numerals (0-9) to Eastern Arabic numerals (٠-٩)
 */
export function toArabicDigits(input: string | number): string {
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return String(input).replace(/[0-9]/g, (w) => arabicDigits[Number(w)] ?? w);
}

/**
 * Format date for Egyptian locale
 */
export function formatArabicDate(date: Date | string, includeTime = false): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('ar-EG', {
    calendar: 'gregory',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...(includeTime ? { hour: 'numeric', minute: 'numeric', hour12: true } : {}),
  }).format(d);
}
