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
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
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
import { examples, SwaggerExamples } from '../swagger/examples';

@ApiTags('Admin — Financials')
@ApiBearerAuth('JWT')
@Controller('admin/financials')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class FinancialsController {
  constructor(private readonly financialsService: FinancialsService) {}

  @Get('pnl')
  @ApiOperation({ summary: 'Get profit & loss summary for a date range' })
  @ApiOkResponse({
    description: 'P&L summary',
    schema: { example: SwaggerExamples.pnlResponse.value },
  })
  getPnl(@Query() query: PnlQueryDto) {
    return this.financialsService.getPnl(query.startDate, query.endDate);
  }

  @Get('expenses')
  @ApiOperation({ summary: 'List expenses (paginated)' })
  listExpenses(@Query() query: PaginationQueryDto) {
    return this.financialsService.listExpenses(query.page, query.limit);
  }

  @Post('expenses')
  @ApiOperation({ summary: 'Record an expense' })
  @ApiBody({ schema: {}, examples: examples('createExpenseRequest') })
  createExpense(@Body() dto: CreateExpenseDto) {
    return this.financialsService.createExpense(dto);
  }

  @Delete('expenses/:id')
  @ApiOperation({ summary: 'Delete an expense' })
  removeExpense(@Param('id') id: string) {
    return this.financialsService.removeExpense(id);
  }

  @Post('damaged-stock')
  @ApiOperation({ summary: 'Write off damaged stock (decrements inventory)' })
  @ApiBody({ schema: {}, examples: examples('damagedStockRequest') })
  recordDamagedStock(@Body() dto: DamagedStockDto) {
    return this.financialsService.recordDamagedStock(dto);
  }
}
