import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductsModule } from '../products/products.module';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { Employee, EmployeeSchema } from '../hr/schemas/employee.schema';
import { FinancialsController } from './financials.controller';
import { FinancialsService } from './financials.service';
import { Expense, ExpenseSchema } from './schemas/expense.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Expense.name, schema: ExpenseSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Employee.name, schema: EmployeeSchema },
    ]),
    ProductsModule,
  ],
  controllers: [FinancialsController],
  providers: [FinancialsService],
  exports: [FinancialsService],
})
export class FinancialsModule {}
