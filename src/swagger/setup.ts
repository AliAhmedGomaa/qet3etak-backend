import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * Serverless hosts (Vercel / Lambda) cannot serve swagger-ui-dist via
 * express.static from node_modules — CSS/JS return 404 under `/docs/*`.
 * Load the matching UI build from a CDN instead.
 */
const SWAGGER_UI_CDN =
  'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.32.8';

/** Mount OpenAPI UI at `/docs` and JSON at `/docs-json`. */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Qet3etak API')
    .setDescription(
      'Wholesale parts marketplace API — auth, catalog, orders, wallets, admin ops, purchasing, and financials.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Paste the JWT from `POST /auth/login` (`accessToken`).',
      },
      'JWT',
    )
    .addTag('Health', 'Liveness / readiness')
    .addTag('Auth', 'Shop registration and login')
    .addTag('Wholesale — Catalog', 'Product search for approved shops')
    .addTag('Wholesale — Orders', 'Checkout and shop order history')
    .addTag('Wholesale — Invoices', 'Shop invoices for placed orders')
    .addTag('Wholesale — Wallet', 'Shop credit wallet')
    .addTag('Wholesale — Brands', 'Active brands for filters')
    .addTag('Wholesale — Categories', 'Active categories for filters')
    .addTag('Wholesale — Special Requests', 'Rare-part requests from shops')
    .addTag('Wholesale — Push', 'Web Push subscriptions (shop)')
    .addTag('Wholesale — Chat', 'Shop ↔ admin messaging')
    .addTag('Admin — Shops', 'Shop approval workflow')
    .addTag('Admin — Products', 'Inventory CRUD')
    .addTag('Admin — Brands', 'Brand CRUD')
    .addTag('Admin — Categories', 'Category CRUD')
    .addTag('Admin — Orders', 'Order board / status updates')
    .addTag('Admin — Invoices', 'Platform invoices list / void')
    .addTag('Admin — Wallets', 'Credit limits and payments')
    .addTag('Admin — Special Requests', 'Quote / fulfill rare parts')
    .addTag('Admin — Push', 'Broadcast and admin push subscriptions')
    .addTag('Admin — Chat', 'Admin side of shop chat')
    .addTag('Admin — Purchasing', 'Suppliers and purchase orders')
    .addTag('Admin — Financials', 'P&L, expenses, damaged stock')
    .addTag('Admin — Delivery', 'Delivery guys, fees, and assignment')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (_controllerKey: string, methodKey: string) =>
      methodKey,
  });

  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    customSiteTitle: 'Qet3etak API Docs',
    customfavIcon: `${SWAGGER_UI_CDN}/favicon-32x32.png`,
    customCssUrl: `${SWAGGER_UI_CDN}/swagger-ui.css`,
    customJs: [
      `${SWAGGER_UI_CDN}/swagger-ui-bundle.js`,
      `${SWAGGER_UI_CDN}/swagger-ui-standalone-preset.js`,
    ],
    // CDN + Nest HTML can leave path wrappers slightly misaligned.
    customCss:
      '.swagger-ui .opblock .opblock-summary-path-description-wrapper { align-items: center; display: flex; flex-wrap: wrap; gap: 0 10px; padding: 0 10px; width: 100%; }',
  });
}
