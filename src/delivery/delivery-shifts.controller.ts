import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DeliveryOnly } from '../auth/decorators/delivery-only.decorator';
import { DeliveryLocationDto } from '../auth/dto/login.dto';
import type { AuthUser } from '../auth/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DeliveryShiftsService } from './delivery-shifts.service';

@ApiTags('Delivery — Shifts')
@ApiBearerAuth('JWT')
@Controller('delivery/shifts')
@UseGuards(JwtAuthGuard, RolesGuard)
@DeliveryOnly()
export class DeliveryShiftsController {
  constructor(private readonly shiftsService: DeliveryShiftsService) {}

  @Get('active')
  @ApiOperation({ summary: 'Get the current open shift (if any)' })
  active(@CurrentUser() user: AuthUser) {
    return this.shiftsService.getActiveShift(user.userId);
  }

  @Post('clock-in')
  @ApiOperation({
    summary: 'Clock in at the workplace (geofenced) to start earning hours',
  })
  @ApiBody({ type: DeliveryLocationDto })
  clockIn(@CurrentUser() user: AuthUser, @Body() dto: DeliveryLocationDto) {
    return this.shiftsService.clockIn(user.userId, dto);
  }

  @Post('clock-out')
  @ApiOperation({ summary: 'Clock out and record hours worked' })
  @ApiBody({ type: DeliveryLocationDto })
  clockOut(@CurrentUser() user: AuthUser, @Body() dto: DeliveryLocationDto) {
    return this.shiftsService.clockOut(user.userId, dto);
  }
}
