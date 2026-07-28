import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

const DEFAULT_ORIGINS = [
  'http://localhost:4200',
  'http://localhost:4201',
  'http://localhost:4202',
  'http://localhost:4203',
  'http://127.0.0.1:4200',
  'http://127.0.0.1:4201',
  'http://127.0.0.1:4202',
  'http://127.0.0.1:4203',
  'http://localhost:4204',
  'http://127.0.0.1:4204',
  'https://qet3etak-shop-owner.vercel.app',
  'https://qet3etak-admin-dashboard.vercel.app',
  'https://qet3etak-employee-portal.vercel.app',
  'https://qet3etak-delivery-portal.vercel.app',
  'https://qet3etak-customer-portal.vercel.app',
  'https://qet3etak-shop-owner-aliahmedgomaas-projects.vercel.app',
  'https://qet3etak-admin-dashboard-aliahmedgomaas-projects.vercel.app',
  'https://qet3etak-employee-portal-aliahmedgomaas-projects.vercel.app',
  'https://qet3etak-delivery-portal-aliahmedgomaas-projects.vercel.app',
  'https://qet3etak-customer-portal-aliahmedgomaas-projects.vercel.app',
];

function parseExtraOrigins(raw?: string): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

function isAllowedOrigin(origin: string, allowlist: string[]): boolean {
  if (allowlist.includes(origin)) return true;
  // Preview deployments: https://qet3etak-*-<hash>-aliahmedgomaas-projects.vercel.app
  try {
    const host = new URL(origin).hostname;
    return (
      host.endsWith('.vercel.app') &&
      (host.includes('qet3etak-shop-owner') ||
        host.includes('qet3etak-admin-dashboard') ||
        host.includes('qet3etak-employee-portal') ||
        host.includes('qet3etak-delivery-portal') ||
        host.includes('qet3etak-customer-portal'))
    );
  } catch {
    return false;
  }
}

/** CORS for browser apps (shop + admin + employee + delivery) calling this API. */
export function buildCorsOptions(): CorsOptions {
  const allowlist = [
    ...DEFAULT_ORIGINS,
    ...parseExtraOrigins(process.env.CORS_ORIGINS),
  ];

  return {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Same-origin / server-to-server / curl — no Origin header.
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, isAllowedOrigin(origin, allowlist));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Origin',
      'X-Requested-With',
    ],
    exposedHeaders: ['Content-Disposition'],
    maxAge: 86400,
  };
}
