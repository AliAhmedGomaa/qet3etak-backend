/**
 * Turn a stored media path (`/uploads/...`) into an absolute URL.
 * Leaves already-absolute / data URLs unchanged.
 */
export function absoluteMediaUrl(
  path?: string | null,
  baseUrl = process.env.PUBLIC_BASE_URL ||
    `http://localhost:${process.env.PORT ?? 3000}`,
): string {
  if (!path?.trim()) return '';
  const value = path.trim();
  if (/^https?:\/\//i.test(value) || value.startsWith('data:')) {
    return value;
  }
  const base = baseUrl.replace(/\/$/, '');
  if (value.startsWith('/')) return `${base}${value}`;
  return `${base}/${value}`;
}

export function withAbsoluteMediaUrl<T extends Record<string, unknown>>(
  entity: T,
  fields: Array<keyof T & string>,
): T {
  const next = { ...entity };
  for (const field of fields) {
    const current = next[field];
    if (typeof current === 'string') {
      (next as Record<string, unknown>)[field] = absoluteMediaUrl(current);
    }
  }
  return next;
}
