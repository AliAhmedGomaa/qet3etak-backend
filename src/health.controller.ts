import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SwaggerExamples } from './swagger/examples';

@ApiTags('Health')
@Controller()
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'API root' })
  @ApiOkResponse({
    description: 'Service identity',
    schema: { example: SwaggerExamples.healthRoot.value },
  })
  root() {
    return { ok: true, service: 'qet3etak-api' };
  }

  @Get('health')
  @ApiOperation({ summary: 'Health check' })
  @ApiOkResponse({
    description: 'Liveness',
    schema: { example: SwaggerExamples.healthOk.value },
  })
  health() {
    return { status: 'ok' };
  }
}
