export interface PaginatedResult<T> {
  data: T[];
  meta: {
    nextCursor: string | null;
    prevCursor: string | null;
    hasMore: boolean;
    limit: number;
  };
}

export function encodeCursor(value: string | number | Date): string {
  const str = value instanceof Date ? value.toISOString() : String(value);
  return Buffer.from(str, 'utf8').toString('base64url');
}

export function decodeCursor(cursor?: string): string | null {
  if (!cursor) return null;
  try {
    return Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

export function buildPaginatedResponse<T>(
  items: T[],
  limit: number,
  getCursorVal: (item: T) => string | number | Date,
): PaginatedResult<T> {
  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;

  let nextCursor: string | null = null;
  let prevCursor: string | null = null;

  if (data.length > 0) {
    if (hasMore) {
      const lastItem = data[data.length - 1]!;
      nextCursor = encodeCursor(getCursorVal(lastItem));
    }
    const firstItem = data[0]!;
    prevCursor = encodeCursor(getCursorVal(firstItem));
  }

  return {
    data,
    meta: {
      nextCursor,
      prevCursor,
      hasMore,
      limit,
    },
  };
}
