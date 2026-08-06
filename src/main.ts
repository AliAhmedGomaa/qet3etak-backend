import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express, { type Express } from 'express';
import { AppModule } from './app.module';
import { buildCorsOptions } from './common/cors';
import { rejectOversizedBody } from './common/reject-oversized-body';
import { UploadExceptionFilter } from './common/upload-exception.filter';
import { setupSwagger } from './swagger/setup';
import { ensureUploadsDir } from './common/uploads';

/**
 * Shared Express instance exported for Vercel.
 * Async-only `app.listen()` races serverless cold starts and can 500 with
 * "No exports found in module …/main.js".
 */
const server: Express = express();

let ready: Promise<void> | null = null;

async function createNestApp(): Promise<void> {
  ensureUploadsDir();

  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(server),
  );
  app.enableCors(buildCorsOptions());
  // Needed behind Render / Cloudflare reverse proxies (correct HTTPS + IPs).
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.use(rejectOversizedBody);
  app.useGlobalFilters(new UploadExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  setupSwagger(app);
  await app.init();

  // Local / long-running hosts still bind a port.
  if (!process.env.VERCEL) {
    const port = process.env.PORT ?? 3000;
    await app.listen(port);
    console.log(`API listening on http://localhost:${port}`);
    console.log(`Swagger UI at http://localhost:${port}/docs`);
  }
}

function ensureReady(): Promise<void> {
  if (!ready) {
    ready = createNestApp().catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}

// Gate every request until Nest finishes init (critical on cold start).
server.use((req, res, next) => {
  void ensureReady()
    .then(() => next())
    .catch((err: unknown) => next(err));
});

void ensureReady();

export default server;

// Vercel Node looks for module.exports (CJS root) as well as .default
module.exports = server;
(module.exports as Express & { default?: Express }).default = server;
