import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { buildCorsOptions } from './common/cors';
import { rejectOversizedBody } from './common/reject-oversized-body';
import { UploadExceptionFilter } from './common/upload-exception.filter';
import { setupSwagger } from './swagger/setup';
import { ensureUploadsDir } from './common/uploads';

async function bootstrap() {
  ensureUploadsDir();

  const app = await NestFactory.create(AppModule);
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

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`API listening on http://localhost:${port}`);
  console.log(`Swagger UI at http://localhost:${port}/docs`);
}
bootstrap();
