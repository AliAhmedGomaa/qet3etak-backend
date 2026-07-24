import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '../common/enums/user.enums';
import { PaginationQueryDto } from '../common/pagination';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  CreateExpenseDto,
  DamagedStockDto,
  PnlQueryDto,
} from './dto/expense.dto';
import { FinancialsService } from './financials.service';

@Controller('admin/financials')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class FinancialsController {
  constructor(private readonly financialsService: FinancialsService) {}

  @Get('pnl')
  getPnl(@Query() query: PnlQueryDto) {
    return this.financialsService.getPnl(query.startDate, query.endDate);
  }

  @Get('expenses')
  listExpenses(@Query() query: PaginationQueryDto) {
    return this.financialsService.listExpenses(query.page, query.limit);
  }

  @Post('expenses')
  createExpense(@Body() dto: CreateExpenseDto) {
    return this.financialsService.createExpense(dto);
  }

  @Delete('expenses/:id')
  removeExpense(@Param('id') id: string) {
    return this.financialsService.removeExpense(id);
  }

  @Post('damaged-stock')
  recordDamagedStock(@Body() dto: DamagedStockDto) {
    return this.financialsService.recordDamagedStock(dto);
  }
}
