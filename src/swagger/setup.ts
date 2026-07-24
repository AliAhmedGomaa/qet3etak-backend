import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

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
    .addTag('Admin — Wallets', 'Credit limits and payments')
    .addTag('Admin — Special Requests', 'Quote / fulfill rare parts')
    .addTag('Admin — Push', 'Broadcast and admin push subscriptions')
    .addTag('Admin — Chat', 'Admin side of shop chat')
    .addTag('Admin — Purchasing', 'Suppliers and purchase orders')
    .addTag('Admin — Financials', 'P&L, expenses, damaged stock')
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
  });
}
