import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  REPAIR_ISSUE_CATALOG,
  RepairBookingStatus,
  RepairTicketSource,
  RepairTicketStatus,
  repairIssueByCode,
} from '../common/enums/repair.enums';
import { PaymentMethod } from '../common/enums/order.enums';
import { UserStatus } from '../common/enums/user.enums';
import {
  normalizePagination,
  paginatedResult,
  type PaginatedResult,
} from '../common/pagination';
import { BrandsService } from '../brands/brands.service';
import { OrdersService } from '../orders/orders.service';
import { UsersService } from '../users/users.service';
import type { AuthUser } from '../auth/guards/roles.guard';
import {
  AttachPartDto,
  CreateRepairBookingDto,
  CreateRepairTicketDto,
  UpdateRepairStatusDto,
} from './dto/repair.dto';
import {
  RepairBooking,
  RepairBookingDocument,
} from './schemas/repair-booking.schema';
import {
  RepairTicket,
  RepairTicketDocument,
} from './schemas/repair-ticket.schema';

function view(doc: { toJSON: () => unknown }): Record<string, unknown> {
  return doc.toJSON() as Record<string, unknown>;
}

@Injectable()
export class RepairService {
  constructor(
    @InjectModel(RepairTicket.name)
    private readonly ticketModel: Model<RepairTicket>,
    @InjectModel(RepairBooking.name)
    private readonly bookingModel: Model<RepairBooking>,
    private readonly ordersService: OrdersService,
    private readonly usersService: UsersService,
    private readonly brandsService: BrandsService,
  ) {}

  listIssues() {
    return { items: REPAIR_ISSUE_CATALOG };
  }

  async listBrands(page?: number, limit?: number, q?: string) {
    return this.brandsService.listActive(page, limit ?? 100, q);
  }

  estimate(issueCode: string, _brandId?: string, _deviceModel?: string) {
    const issue = repairIssueByCode(issueCode);
    if (!issue) {
      throw new BadRequestException('Unknown repair issue code');
    }
    return {
      issueCode: issue.code,
      labelAr: issue.labelAr,
      labelEn: issue.labelEn,
      estimatedMin: issue.costMin,
      estimatedMax: issue.costMax,
      currency: 'EGP',
    };
  }

  async listPartnerShops(city?: string, page?: number, limit?: number) {
    const result = await this.usersService.findShops(
      UserStatus.APPROVED,
      page,
      limit ?? 30,
      city?.trim() || undefined,
    );
    return {
      ...result,
      items: result.items.map((s) => {
        const json = s.toJSON() as unknown as Record<string, unknown>;
        return {
          id: json.id,
          shopName: json.shopName,
          city: json.city,
          address: json.address,
          // Public: do not expose full phone; last 4 only
          phoneHint:
            typeof json.phone === 'string' && json.phone.length >= 4
              ? `***${json.phone.slice(-4)}`
              : '',
        };
      }),
    };
  }

  async createByShop(
    user: AuthUser,
    dto: CreateRepairTicketDto,
  ): Promise<Record<string, unknown>> {
    const shop = await this.usersService.findByIdOrFail(user.userId);
    let brandName = dto.brandName?.trim() || '';
    let brandId: Types.ObjectId | null = null;
    if (dto.brandId && Types.ObjectId.isValid(dto.brandId)) {
      const brand = await this.brandsService.findByIdOrFail(dto.brandId);
      brandId = brand._id as Types.ObjectId;
      brandName = brand.name;
    }

    const issue = dto.issueCode ? repairIssueByCode(dto.issueCode) : undefined;
    const laborFee = dto.laborFee ?? 0;
    const estimatedCost =
      dto.estimatedCost ??
      (issue ? Math.round((issue.costMin + issue.costMax) / 2) : 0);

    const now = new Date();
    const ticketNumber = await this.nextTicketNumber();
    const ticket = await this.ticketModel.create({
      ticketNumber,
      shopId: shop._id,
      shopName: shop.shopName || shop.fullName,
      customerId: null,
      customerName: dto.customerName.trim(),
      customerPhone: dto.customerPhone.trim(),
      brandId,
      brandName,
      deviceModel: dto.deviceModel.trim(),
      issueCode: dto.issueCode?.trim() || issue?.code || '',
      issueDescription: dto.issueDescription.trim(),
      status: RepairTicketStatus.RECEIVED,
      statusHistory: [
        {
          status: RepairTicketStatus.RECEIVED,
          at: now,
          note: 'تم استلام الجهاز',
        },
      ],
      estimatedCost,
      laborFee,
      partsCost: 0,
      totalCost: estimatedCost || laborFee,
      warrantyDays: dto.warrantyDays ?? 0,
      homePickup: !!dto.homePickup,
      city: dto.city?.trim() || shop.city || '',
      address: dto.address?.trim() || '',
      source: RepairTicketSource.SHOP,
    });

    return view(ticket);
  }

  async listForShop(
    shopId: string,
    page?: number,
    limit?: number,
    q?: string,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const p = normalizePagination(page, limit, 20);
    const filter: Record<string, unknown> = {
      shopId: new Types.ObjectId(shopId),
    };
    if (q?.trim()) {
      const rx = new RegExp(
        q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );
      filter['$or'] = [
        { ticketNumber: rx },
        { customerName: rx },
        { customerPhone: rx },
        { deviceModel: rx },
      ];
    }
    const [items, total] = await Promise.all([
      this.ticketModel
        .find(filter)
        .sort({ updatedAt: -1 })
        .skip(p.skip)
        .limit(p.limit)
        .exec(),
      this.ticketModel.countDocuments(filter).exec(),
    ]);
    return paginatedResult(
      items.map((t) => view(t)),
      total,
      p.page,
      p.limit,
    );
  }

  async getForShop(
    shopId: string,
    ticketId: string,
  ): Promise<Record<string, unknown>> {
    const ticket = await this.findOwned(shopId, ticketId);
    return view(ticket);
  }

  async updateStatus(
    shopId: string,
    ticketId: string,
    dto: UpdateRepairStatusDto,
  ): Promise<Record<string, unknown>> {
    const ticket = await this.findOwned(shopId, ticketId);
    this.assertTransition(ticket.status, dto.status);

    ticket.status = dto.status;
    ticket.statusHistory.push({
      status: dto.status,
      at: new Date(),
      note: dto.note?.trim() || '',
    });

    if (dto.laborFee !== undefined) ticket.laborFee = dto.laborFee;
    if (dto.warrantyDays !== undefined) ticket.warrantyDays = dto.warrantyDays;
    if (dto.totalCost !== undefined) {
      ticket.totalCost = dto.totalCost;
    } else {
      ticket.totalCost = Number(
        (ticket.laborFee + ticket.partsCost).toFixed(2),
      );
    }

    if (
      dto.status === RepairTicketStatus.READY ||
      dto.status === RepairTicketStatus.DELIVERED
    ) {
      ticket.completedAt = ticket.completedAt ?? new Date();
      if (!ticket.warrantyDays && dto.warrantyDays) {
        ticket.warrantyDays = dto.warrantyDays;
      }
      if (!ticket.warrantyDays) ticket.warrantyDays = 90;
    }

    await ticket.save();
    return view(ticket);
  }

  async attachPart(
    shopId: string,
    ticketId: string,
    dto: AttachPartDto,
  ): Promise<Record<string, unknown>> {
    const ticket = await this.findOwned(shopId, ticketId);
    if (
      ticket.status === RepairTicketStatus.READY ||
      ticket.status === RepairTicketStatus.DELIVERED
    ) {
      throw new BadRequestException('Cannot attach parts to a finished ticket');
    }
    if (ticket.partsOrderId) {
      throw new BadRequestException('Parts order already created for this ticket');
    }

    const order = await this.ordersService.checkout(shopId, {
      items: [{ productId: dto.productId, quantity: 1 }],
      paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
      notes: `Repair ticket ${ticket.ticketNumber}`,
    });

    const line = order.items?.[0];
    const partsCost = line?.lineTotal ?? order.total ?? 0;
    const laborFee =
      dto.laborFee !== undefined ? dto.laborFee : ticket.laborFee;

    ticket.requiredPartId = new Types.ObjectId(dto.productId);
    ticket.requiredPartTitle = line?.title || '';
    ticket.partsOrderId = order._id as Types.ObjectId;
    ticket.partsOrderNumber = order.orderNumber;
    ticket.partsCost = partsCost;
    ticket.laborFee = laborFee;
    ticket.totalCost = Number((laborFee + partsCost).toFixed(2));
    ticket.estimatedCost = ticket.totalCost;
    if (dto.warrantyDays !== undefined) ticket.warrantyDays = dto.warrantyDays;

    ticket.status = RepairTicketStatus.WAITING_FOR_PARTS;
    ticket.statusHistory.push({
      status: RepairTicketStatus.WAITING_FOR_PARTS,
      at: new Date(),
      note: `تم طلب القطعة ${ticket.requiredPartTitle || ''} — طلب ${order.orderNumber}`,
    });

    await ticket.save();
    return view(ticket);
  }

  async trackByNumber(ticketNumber: string): Promise<Record<string, unknown>> {
    const ticket = await this.ticketModel
      .findOne({ ticketNumber: ticketNumber.trim().toUpperCase() })
      .exec();
    if (!ticket) {
      // also allow case-insensitive exact match
      const loose = await this.ticketModel
        .findOne({
          ticketNumber: new RegExp(
            `^${ticketNumber.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
            'i',
          ),
        })
        .exec();
      if (!loose) throw new NotFoundException('Ticket not found');
      return this.toPublicTrack(loose);
    }
    return this.toPublicTrack(ticket);
  }

  async createBooking(
    dto: CreateRepairBookingDto,
  ): Promise<Record<string, unknown>> {
    const issue = repairIssueByCode(dto.issueCode);
    if (!issue) throw new BadRequestException('Unknown repair issue code');

    let brandName = dto.brandName?.trim() || '';
    let brandId: Types.ObjectId | null = null;
    if (dto.brandId && Types.ObjectId.isValid(dto.brandId)) {
      const brand = await this.brandsService.findByIdOrFail(dto.brandId);
      brandId = brand._id as Types.ObjectId;
      brandName = brand.name;
    }

    let preferredShopId: Types.ObjectId | null = null;
    let preferredShopName = '';
    let shopDoc = null as Awaited<
      ReturnType<UsersService['findById']>
    >;

    if (dto.preferredShopId && Types.ObjectId.isValid(dto.preferredShopId)) {
      shopDoc = await this.usersService.findById(dto.preferredShopId);
      if (
        !shopDoc ||
        shopDoc.role !== 'SHOP_OWNER' ||
        shopDoc.status !== UserStatus.APPROVED
      ) {
        throw new BadRequestException('Invalid preferred shop');
      }
      preferredShopId = shopDoc._id as Types.ObjectId;
      preferredShopName = shopDoc.shopName || shopDoc.fullName;
    }

    const booking = await this.bookingModel.create({
      brandId,
      brandName,
      deviceModel: dto.deviceModel.trim(),
      issueCode: issue.code,
      issueDescription:
        dto.issueDescription?.trim() || issue.labelAr,
      estimatedMin: issue.costMin,
      estimatedMax: issue.costMax,
      preferredShopId,
      preferredShopName,
      homePickup: !!dto.homePickup,
      customerName: dto.customerName.trim(),
      customerPhone: dto.customerPhone.trim(),
      city: dto.city?.trim() || '',
      address: dto.address?.trim() || '',
      status: RepairBookingStatus.PENDING,
    });

    let ticket: RepairTicketDocument | null = null;
    if (shopDoc && preferredShopId) {
      const ticketNumber = await this.nextTicketNumber();
      const now = new Date();
      const estimatedCost = Math.round((issue.costMin + issue.costMax) / 2);
      ticket = await this.ticketModel.create({
        ticketNumber,
        shopId: preferredShopId,
        shopName: preferredShopName,
        customerId: null,
        customerName: dto.customerName.trim(),
        customerPhone: dto.customerPhone.trim(),
        brandId,
        brandName,
        deviceModel: dto.deviceModel.trim(),
        issueCode: issue.code,
        issueDescription:
          dto.issueDescription?.trim() || issue.labelAr,
        status: RepairTicketStatus.RECEIVED,
        statusHistory: [
          {
            status: RepairTicketStatus.RECEIVED,
            at: now,
            note: 'حجز عبر تطبيق العملاء',
          },
        ],
        estimatedCost,
        laborFee: 0,
        partsCost: 0,
        totalCost: estimatedCost,
        warrantyDays: 0,
        homePickup: !!dto.homePickup,
        city: dto.city?.trim() || shopDoc.city || '',
        address: dto.address?.trim() || '',
        source: RepairTicketSource.C2B_BOOKING,
      });
      booking.status = RepairBookingStatus.ACCEPTED;
      booking.ticketId = ticket._id as Types.ObjectId;
      booking.ticketNumber = ticket.ticketNumber;
      await booking.save();
    }

    return {
      booking: view(booking),
      ticket: ticket ? view(ticket) : null,
      ticketNumber: ticket?.ticketNumber ?? null,
    };
  }

  private toPublicTrack(ticket: RepairTicketDocument): Record<string, unknown> {
    const json = view(ticket);
    return {
      ticketNumber: json.ticketNumber,
      status: json.status,
      statusHistory: json.statusHistory,
      shopName: json.shopName,
      brandName: json.brandName,
      deviceModel: json.deviceModel,
      issueCode: json.issueCode,
      issueDescription: json.issueDescription,
      requiredPartTitle: json.requiredPartTitle,
      estimatedCost: json.estimatedCost,
      laborFee: json.laborFee,
      partsCost: json.partsCost,
      totalCost: json.totalCost,
      warrantyDays: json.warrantyDays,
      completedAt: json.completedAt,
      homePickup: json.homePickup,
      city: json.city,
      customerName: json.customerName,
      createdAt: json.createdAt,
      updatedAt: json.updatedAt,
    };
  }

  private async findOwned(
    shopId: string,
    ticketId: string,
  ): Promise<RepairTicketDocument> {
    if (!Types.ObjectId.isValid(ticketId)) {
      throw new NotFoundException('Ticket not found');
    }
    const ticket = await this.ticketModel.findById(ticketId).exec();
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (String(ticket.shopId) !== shopId) {
      throw new ForbiddenException('Ticket does not belong to this shop');
    }
    return ticket;
  }

  private assertTransition(
    from: RepairTicketStatus,
    to: RepairTicketStatus,
  ): void {
    if (from === to) return;
    const allowed: Record<RepairTicketStatus, RepairTicketStatus[]> = {
      [RepairTicketStatus.RECEIVED]: [
        RepairTicketStatus.DIAGNOSING,
        RepairTicketStatus.WAITING_FOR_PARTS,
        RepairTicketStatus.REPAIRING,
      ],
      [RepairTicketStatus.DIAGNOSING]: [
        RepairTicketStatus.WAITING_FOR_PARTS,
        RepairTicketStatus.REPAIRING,
        RepairTicketStatus.READY,
      ],
      [RepairTicketStatus.WAITING_FOR_PARTS]: [
        RepairTicketStatus.REPAIRING,
        RepairTicketStatus.DIAGNOSING,
      ],
      [RepairTicketStatus.REPAIRING]: [
        RepairTicketStatus.READY,
        RepairTicketStatus.WAITING_FOR_PARTS,
      ],
      [RepairTicketStatus.READY]: [RepairTicketStatus.DELIVERED],
      [RepairTicketStatus.DELIVERED]: [],
    };
    if (!allowed[from]?.includes(to)) {
      throw new BadRequestException(
        `Cannot move ticket from ${from} to ${to}`,
      );
    }
  }

  private async nextTicketNumber(): Promise<string> {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `RT-${day}-`;
    const latest = await this.ticketModel
      .findOne({ ticketNumber: new RegExp(`^${prefix}`) })
      .sort({ ticketNumber: -1 })
      .select('ticketNumber')
      .lean()
      .exec();
    let seq = 1;
    if (latest?.ticketNumber) {
      const tail = latest.ticketNumber.slice(prefix.length);
      const n = parseInt(tail, 10);
      if (!Number.isNaN(n)) seq = n + 1;
    }
    return `${prefix}${String(seq).padStart(5, '0')}`;
  }
}
