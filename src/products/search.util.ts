/**
 * Smart catalog search helpers.
 * Supports partial matches, multi-token queries, synonyms (EN/AR), and relevance scoring.
 */

const SEARCH_FIELDS = [
  'title',
  'brand',
  'model',
  'category',
  'part',
  'sku',
  'qualityGrade',
] as const;

/** Maps common search terms → expandable variants (EN + AR + slang). */
const SYNONYM_GROUPS: string[][] = [
  ['screen', 'screens', 'lcd', 'oled', 'display', 'شاشه', 'شاشة', 'شاشات'],
  ['battery', 'batteries', 'بطاريه', 'بطارية', 'بطاريات'],
  [
    'charging',
    'charger',
    'port',
    'ports',
    'usb',
    'type-c',
    'typec',
    'شحن',
    'منفذ',
  ],
  ['back', 'cover', 'covers', 'glass', 'housing', 'ظهر', 'غلاف', 'غطاء'],
  ['camera', 'cameras', 'lens', 'عدسه', 'عدسة', 'كاميرا'],
  ['speaker', 'speakers', 'earpiece', 'loudspeaker', 'سماعة', 'سماعات'],
  ['flex', 'cable', 'cables', 'فلكس', 'سلك'],
  ['button', 'buttons', 'power', 'volume', 'زر', 'ازرار', 'أزرار'],
  ['adhesive', 'tape', 'غراء', 'لاصق'],
  ['tool', 'tools', 'screwdriver', 'اداه', 'أداة', 'ادوات', 'أدوات'],
  ['iphone', 'ايفون', 'آيفون'],
  ['samsung', 'سامسونج', 'سامسونغ'],
  ['xiaomi', 'شاومي', 'redmi', 'ريدمي'],
  ['huawei', 'هواوي'],
  ['oppo', 'اوبو', 'أوبو'],
  ['oneplus', 'ون بلس', 'وان بلس'],
];

/** Quality-grade aliases → exact enum values (avoid short false-positive regexes). */
const GRADE_ALIASES: Array<{ aliases: string[]; value: string }> = [
  {
    aliases: ['original', 'org', 'oem', 'اصلي', 'أصلي', 'اصلى'],
    value: 'Original',
  },
  {
    aliases: ['highcopy', 'high copy', 'high-copy', 'hc', 'هاي كوبي', 'هاي كوبى'],
    value: 'HighCopy',
  },
  {
    aliases: ['copy', 'cpy', 'aftermarket', 'كوبي', 'تقليد'],
    value: 'Copy',
  },
  {
    aliases: ['used', 'refurbished', 'refurb', 'مستعمل', 'مجددة', 'مجدد'],
    value: 'Used',
  },
];

const FIELD_WEIGHTS: Record<(typeof SEARCH_FIELDS)[number], number> = {
  title: 12,
  part: 11,
  sku: 10,
  brand: 8,
  model: 8,
  category: 6,
  qualityGrade: 4,
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeToken(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[_/\\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveGrade(token: string): string | null {
  const normalized = normalizeToken(token);
  const compact = normalized.replace(/\s+/g, '');
  for (const group of GRADE_ALIASES) {
    for (const alias of group.aliases) {
      const a = normalizeToken(alias);
      if (a === normalized || a.replace(/\s+/g, '') === compact) {
        return group.value;
      }
    }
  }
  return null;
}

function expandToken(token: string): string[] {
  const normalized = normalizeToken(token);
  if (!normalized) return [];

  const variants = new Set<string>([normalized]);

  // Collapse spaces for SKU-like matching (e.g. "high copy" → "highcopy")
  const compact = normalized.replace(/\s+/g, '');
  if (compact !== normalized) variants.add(compact);

  for (const group of SYNONYM_GROUPS) {
    const hit = group.some((term) => {
      const t = normalizeToken(term);
      const tc = t.replace(/\s+/g, '');
      return (
        t === normalized ||
        tc === compact ||
        (normalized.length >= 3 && (t.includes(normalized) || tc.includes(compact))) ||
        (t.length >= 3 && (normalized.includes(t) || compact.includes(tc)))
      );
    });
    if (hit) {
      for (const term of group) {
        const t = normalizeToken(term);
        if (t.length >= 3) variants.add(t);
        const c = t.replace(/\s+/g, '');
        if (c.length >= 3) variants.add(c);
      }
    }
  }

  // Drop ultra-short variants that cause false positives (e.g. "hc", "org")
  return [...variants].filter((v) => v.length >= 2);
}

/** Split a free-text query into searchable tokens. */
export function tokenizeQuery(q: string): string[] {
  return normalizeToken(q)
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 1);
}

/**
 * Builds a Mongo filter that matches products where EVERY token hits at least one field
 * (after synonym expansion). Partial / substring matches are allowed.
 */
export function buildSmartSearchFilter(q: string): Record<string, unknown> | null {
  const tokens = tokenizeQuery(q);
  if (!tokens.length) return null;

  const tokenClauses = tokens.map((token) => {
    const grade = resolveGrade(token);
    if (grade) {
      return { qualityGrade: grade };
    }

    const variants = expandToken(token);
    const or: Array<Record<string, unknown>> = [];

    for (const variant of variants) {
      const pattern = escapeRegex(variant);
      for (const field of SEARCH_FIELDS) {
        or.push({ [field]: { $regex: pattern, $options: 'i' } });
      }
    }

    return { $or: or };
  });

  return tokenClauses.length === 1 ? tokenClauses[0]! : { $and: tokenClauses };
}

/**
 * Aggregation expression that scores how well a document matches the query.
 * Higher = better (exact-ish title/sku hits rank first).
 */
export function buildRelevanceScoreExpr(q: string): Record<string, unknown> {
  const tokens = tokenizeQuery(q);
  const addends: unknown[] = [];

  for (const token of tokens) {
    const grade = resolveGrade(token);
    if (grade) {
      addends.push({
        $cond: [{ $eq: ['$qualityGrade', grade] }, 40, 0],
      });
      continue;
    }

    const variants = expandToken(token);
    for (const variant of variants) {
      const pattern = escapeRegex(variant);
      for (const field of SEARCH_FIELDS) {
        const weight = FIELD_WEIGHTS[field];
        addends.push({
          $cond: [
            {
              $regexMatch: {
                input: { $toString: { $ifNull: [`$${field}`, ''] } },
                regex: `^${pattern}`,
                options: 'i',
              },
            },
            weight * 2,
            0,
          ],
        });
        addends.push({
          $cond: [
            {
              $regexMatch: {
                input: { $toString: { $ifNull: [`$${field}`, ''] } },
                regex: pattern,
                options: 'i',
              },
            },
            weight,
            0,
          ],
        });
      }
    }
  }

  // Prefer in-stock items slightly
  addends.push({
    $cond: [{ $gt: ['$stockQuantity', 0] }, 3, 0],
  });

  return { $add: addends.length ? addends : [0] };
}

/**
 * Generic part filter: each selected value expands via synonyms and matches
 * `part` or `title` (OR across selected parts — multi-select semantics).
 */
export function buildPartFilter(parts: string[]): Record<string, unknown> | null {
  const selected = parts.map((p) => p.trim()).filter(Boolean);
  if (!selected.length) return null;

  const or: Array<Record<string, unknown>> = [];

  for (const value of selected) {
    const grade = resolveGrade(value);
    // Ignore accidental grade terms in part filter
    if (grade && normalizeToken(value) === normalizeToken(grade)) continue;

    const variants = new Set<string>([value, ...expandToken(value)]);
    // Also keep the original casing-insensitive exact part name
    variants.add(normalizeToken(value));

    for (const variant of variants) {
      if (!variant || variant.length < 2) continue;
      const pattern = escapeRegex(variant);
      or.push({ part: { $regex: pattern, $options: 'i' } });
      or.push({ title: { $regex: pattern, $options: 'i' } });
    }
  }

  if (!or.length) return null;
  return { $or: or };
}

/** Infer part name from title when model prefix is known. */
export function inferPartFromTitle(title: string, model?: string): string {
  const t = title.trim();
  if (!t) return '';
  if (model?.trim()) {
    const m = model.trim();
    if (t.toLowerCase().startsWith(m.toLowerCase())) {
      return t.slice(m.length).trim();
    }
  }
  return t;
}
