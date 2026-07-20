import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get()
  root() {
    return { ok: true, service: 'qet3etak-api' };
  }

  @Get('health')
  health() {
    return { status: 'ok' };
  }
}
