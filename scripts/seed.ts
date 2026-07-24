/**
 * Database seeder — populates MongoDB with realistic demo data.
 *
 * Usage:
 *   npm run seed          # full seed if empty; if DB already has users,
 *                         # upserts delivery_guys (by phone), backfills
 *                         # missing invoices (by orderId), and upserts
 *                         # sample return_requests (by [SEED] reason key)
 *   npm run seed:reset    # drop app collections and reseed from scratch
 *                         # (do NOT run against shared/production Atlas)
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import * as bcrypt from 'bcrypt';
import mongoose, { Types } from 'mongoose';
import {
  DeliveryFeeModel,
  DeliveryGuyStatus,
} from '../src/common/enums/delivery.enums';
import { BranchStatus } from '../src/common/enums/branch.enums';
import { InvoiceStatus } from '../src/common/enums/invoice.enums';
import { OrderStatus, PaymentMethod, WalletTxType } from '../src/common/enums/order.enums';
import { QualityGrade } from '../src/common/enums/product.enums';
import {
  ReturnRefundMethod,
  ReturnRequestStatus,
} from '../src/common/enums/return.enums';
import { SpecialRequestStatus } from '../src/common/enums/special-request.enums';
import { UserRole, UserStatus } from '../src/common/enums/user.enums';

function loadEnvFile(): void {
  const envPath = join(process.cwd(), '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile();

const RESET = process.env.SEED_RESET === 'true' || process.argv.includes('--reset');

const ADMIN_PHONE = process.env.ADMIN_PHONE ?? '0500000000';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'Admin123!';
const SHOP_PASSWORD = 'Shop123!';
const MONGODB_URI =
  process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/qet3etak';

const COLLECTIONS = [
  'users',
  'products',
  'orders',
  'invoices',
  'wallets',
  'special_requests',
  'push_subscriptions',
  'brands',
  'categories',
  'suppliers',
  'purchase_orders',
  'expenses',
  'chat_conversations',
  'chat_messages',
  'delivery_guys',
  'return_requests',
] as const;

/** Marker in reason — idempotent upsert key for seeded return requests. */
const RETURN_SEED_PREFIX = '[SEED]';

type SeedReturnScenario = {
  key: string;
  status: ReturnRequestStatus;
  /** Prefer CREDIT orders when true, COD when false, either when undefined. */
  preferCredit?: boolean;
  /** Return fewer than full qty on first line when possible. */
  partial: boolean;
  reason: string;
  adminNote?: string;
};

const RETURN_SEED_SCENARIOS: SeedReturnScenario[] = [
  {
    key: 'pending-partial',
    status: ReturnRequestStatus.PENDING,
    preferCredit: true,
    partial: true,
    reason: `${RETURN_SEED_PREFIX}pending-partial القطعة تالفة جزئياً`,
  },
  {
    key: 'pending-full',
    status: ReturnRequestStatus.PENDING,
    preferCredit: false,
    partial: false,
    reason: `${RETURN_SEED_PREFIX}pending-full غير مطابقة للمواصفات`,
  },
  {
    key: 'pending-multi',
    status: ReturnRequestStatus.PENDING,
    partial: true,
    reason: `${RETURN_SEED_PREFIX}pending-multi كمية زائدة في الشحنة`,
  },
  {
    key: 'approved-credit',
    status: ReturnRequestStatus.APPROVED,
    preferCredit: true,
    partial: true,
    reason: `${RETURN_SEED_PREFIX}approved-credit شاشة بها خدوش`,
    adminNote: 'تم الاستلام وإعادة التخزين (بيانات تجريبية)',
  },
  {
    key: 'approved-cod',
    status: ReturnRequestStatus.APPROVED,
    preferCredit: false,
    partial: false,
    reason: `${RETURN_SEED_PREFIX}approved-cod بطارية ضعيفة`,
    adminNote: 'موافقة تجريبية — COD بدون تعديل محفظة',
  },
  {
    key: 'rejected',
    status: ReturnRequestStatus.REJECTED,
    partial: false,
    reason: `${RETURN_SEED_PREFIX}rejected خارج فترة القبول`,
    adminNote: 'مرفوض تجريبياً — خارج نافذة الإرجاع',
  },
];

/** Egyptian-style couriers — upserted by phone (safe to re-run). */
const DELIVERY_GUYS: Array<{
  fullName: string;
  phone: string;
  city: string;
  vehicleType: string;
  notes: string;
  status: DeliveryGuyStatus;
  feeModel: DeliveryFeeModel;
  flatFee: number;
  percentRate: number;
  baseFee: number;
  perItemFee: number;
}> = [
  {
    fullName: 'أحمد محمود حسن',
    phone: '0100501001',
    city: 'Cairo',
    vehicleType: 'Motorbike',
    notes: 'Nasr City & Heliopolis routes',
    status: DeliveryGuyStatus.ACTIVE,
    feeModel: DeliveryFeeModel.FLAT,
    flatFee: 30,
    percentRate: 0,
    baseFee: 20,
    perItemFee: 2,
  },
  {
    fullName: 'محمود إبراهيم علي',
    phone: '0100501002',
    city: 'Giza',
    vehicleType: 'Motorbike',
    notes: 'Dokki & Mohandessin',
    status: DeliveryGuyStatus.ACTIVE,
    feeModel: DeliveryFeeModel.FLAT,
    flatFee: 35,
    percentRate: 0,
    baseFee: 20,
    perItemFee: 2,
  },
  {
    fullName: 'يوسف عبد الرحمن',
    phone: '0110501003',
    city: 'Alexandria',
    vehicleType: 'Car',
    notes: 'Smouha & Stanley',
    status: DeliveryGuyStatus.ACTIVE,
    feeModel: DeliveryFeeModel.FLAT,
    flatFee: 40,
    percentRate: 0,
    baseFee: 20,
    perItemFee: 2,
  },
  {
    fullName: 'كريم مصطفى فتحي',
    phone: '0100501004',
    city: 'Cairo',
    vehicleType: 'Motorbike',
    notes: 'Maadi & New Cairo',
    status: DeliveryGuyStatus.ACTIVE,
    feeModel: DeliveryFeeModel.FLAT,
    flatFee: 28,
    percentRate: 0,
    baseFee: 20,
    perItemFee: 2,
  },
  {
    fullName: 'عمر سعيد خليل',
    phone: '0120501005',
    city: 'Mansoura',
    vehicleType: 'Motorbike',
    notes: 'Delta coverage',
    status: DeliveryGuyStatus.ACTIVE,
    feeModel: DeliveryFeeModel.FLAT,
    flatFee: 25,
    percentRate: 0,
    baseFee: 20,
    perItemFee: 2,
  },
  {
    fullName: 'حسام الدين ناجي',
    phone: '0100501006',
    city: 'Cairo',
    vehicleType: 'Van',
    notes: 'Bulk / multi-shop runs',
    status: DeliveryGuyStatus.ACTIVE,
    feeModel: DeliveryFeeModel.PERCENT,
    flatFee: 30,
    percentRate: 2.5,
    baseFee: 20,
    perItemFee: 2,
  },
  {
    fullName: 'طارق حسن الشاذلي',
    phone: '0150501007',
    city: 'Giza',
    vehicleType: 'Motorbike',
    notes: '6th of October & Sheikh Zayed',
    status: DeliveryGuyStatus.ACTIVE,
    feeModel: DeliveryFeeModel.BASE_PLUS_ITEMS,
    flatFee: 30,
    percentRate: 0,
    baseFee: 20,
    perItemFee: 3,
  },
];

const CITIES = [
  'Riyadh',
  'Jeddah',
  'Dammam',
  'Makkah',
  'Madinah',
  'Khobar',
  'Tabuk',
  'Abha',
];

const BRANDS: Record<string, string[]> = {
  Apple: ['iPhone 15', 'iPhone 14', 'iPhone 13', 'iPhone 12', 'iPhone 11'],
  Samsung: ['Galaxy S24', 'Galaxy S23', 'Galaxy A54', 'Galaxy A34', 'Galaxy Z Flip 5'],
  Xiaomi: ['Redmi Note 13', 'Redmi Note 12', 'Poco X6', 'Mi 13', 'Redmi 12'],
  Huawei: ['P60', 'P50', 'Nova 11', 'Mate 50', 'Y9a'],
  Oppo: ['Reno 11', 'A98', 'Find X6', 'A78', 'Reno 10'],
  OnePlus: ['12', '11', 'Nord 3', 'Nord CE 3', '10 Pro'],
  Realme: ['GT 5', '11 Pro', 'C55', 'Narzo 60', '10 Pro'],
  Google: ['Pixel 8', 'Pixel 7a', 'Pixel 7', 'Pixel 6a', 'Pixel Fold'],
  Sony: ['Xperia 1 V', 'Xperia 10 V', 'Xperia 5 V', 'Xperia Pro-I'],
  Nokia: ['G60', 'X30', 'G21', 'C32', 'XR21'],
};

const CATEGORIES = [
  'Screens',
  'Batteries',
  'Charging Ports',
  'Back Covers',
  'Cameras',
  'Speakers',
  'Flex Cables',
  'Buttons',
  'Adhesives',
  'Tools',
];

const PART_NAMES = [
  'LCD Assembly',
  'OLED Display',
  'Battery Pack',
  'Charging Port Flex',
  'Rear Glass Panel',
  'Main Camera Module',
  'Front Camera',
  'Earpiece Speaker',
  'Loudspeaker',
  'Power Button Flex',
  'Volume Flex Cable',
  'Fingerprint Sensor',
  'SIM Tray',
  'Back Camera Lens',
  'Wireless Charging Coil',
];

const SPECIAL_PARTS = [
  'Rare Logic Board',
  'NFC Antenna Module',
  'Haptic Engine',
  'Face ID Sensor Array',
  'UWB Chip Module',
  'Thermal Sensor Cable',
  '5G Antenna Flex',
  'Motherboard Connector',
];

const PRODUCT_IMAGE = '/uploads/product-placeholder.png';
const SHOP_IMAGE = '/uploads/shop-placeholder.png';
const RARE_IMAGE = '/uploads/shop-placeholder.png';

const CATEGORY_IMAGES: Record<string, string> = {
  Screens: '/uploads/product-screens.png',
  Batteries: '/uploads/product-batteries.png',
  'Charging Ports': '/uploads/product-charging.png',
  'Back Covers': '/uploads/product-covers.png',
  Cameras: '/uploads/product-cameras.png',
  Speakers: '/uploads/product-generic.png',
  'Flex Cables': '/uploads/product-flex.png',
  Buttons: '/uploads/product-generic.png',
  Adhesives: '/uploads/product-generic.png',
  Tools: '/uploads/product-generic.png',
};

function productImageFor(category: string): string {
  return CATEGORY_IMAGES[category] ?? PRODUCT_IMAGE;
}

async function upsertDeliveryGuys(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  col: any,
): Promise<number> {
  const now = new Date();
  let touched = 0;
  for (const guy of DELIVERY_GUYS) {
    const result = await col.updateOne(
      { phone: guy.phone },
      {
        $set: {
          fullName: guy.fullName,
          phone: guy.phone,
          city: guy.city,
          vehicleType: guy.vehicleType,
          notes: guy.notes,
          status: guy.status,
          feeModel: guy.feeModel,
          flatFee: guy.flatFee,
          percentRate: guy.percentRate,
          baseFee: guy.baseFee,
          perItemFee: guy.perItemFee,
          updatedAt: now,
        },
        $setOnInsert: {
          totalDeliveries: 0,
          totalFeesEarned: 0,
          createdAt: now,
        },
      },
      { upsert: true },
    );
    if (result.upsertedCount > 0 || result.modifiedCount > 0) touched++;
  }
  await col.createIndex({ phone: 1 }, { unique: true });
  await col.createIndex({ status: 1 });
  return touched;
}

const SAMPLE_BRANCHES = [
  {
    code: 'CAI-DT',
    name: 'فرع وسط القاهرة',
    city: 'Cairo',
    address: '12 Tahrir St, Downtown',
    phone: '01001112233',
    notes: 'Seed sample branch',
  },
  {
    code: 'GIZA-01',
    name: 'فرع الجيزة',
    city: 'Giza',
    address: '45 Haram St',
    phone: '01004445566',
    notes: 'Seed sample branch',
  },
];

async function upsertBranches(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  col: any,
): Promise<number> {
  const now = new Date();
  let touched = 0;
  for (const b of SAMPLE_BRANCHES) {
    const result = await col.updateOne(
      { code: b.code },
      {
        $set: {
          name: b.name,
          code: b.code,
          city: b.city,
          address: b.address,
          phone: b.phone,
          notes: b.notes,
          status: BranchStatus.ACTIVE,
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
        },
      },
      { upsert: true },
    );
    if (result.upsertedCount > 0 || result.modifiedCount > 0) touched++;
  }
  await col.createIndex({ code: 1 }, { unique: true });
  await col.createIndex({ status: 1 });
  return touched;
}

/** Mirrors InvoicesService.sellerFromConfig() for the seed script. */
function sellerFromEnv(): {
  name: string;
  phone: string;
  city: string;
  address: string;
  taxId: string;
} {
  return {
    name:
      process.env.INVOICE_SELLER_NAME?.trim() || 'قطع غيار — Qet3etak',
    phone: process.env.INVOICE_SELLER_PHONE?.trim() || '',
    city: process.env.INVOICE_SELLER_CITY?.trim() || '',
    address: process.env.INVOICE_SELLER_ADDRESS?.trim() || '',
    taxId: process.env.INVOICE_SELLER_TAX_ID?.trim() || '',
  };
}

type InvoiceBackfillResult = {
  created: number;
  skipped: number;
  samples: string[];
};

/**
 * Idempotent: one invoice per orderId (mirrors InvoicesService.issueFromOrder).
 * Safe to re-run — never wipes the invoices collection.
 */
async function backfillInvoices(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
): Promise<InvoiceBackfillResult> {
  const ordersCol = db.collection('orders');
  const invoicesCol = db.collection('invoices');
  const usersCol = db.collection('users');

  await invoicesCol.createIndex({ invoiceNumber: 1 }, { unique: true });
  await invoicesCol.createIndex({ orderId: 1 }, { unique: true });
  await invoicesCol.createIndex({ shopId: 1, issuedAt: -1 });

  const orders = await ordersCol
    .find({})
    .project({
      _id: 1,
      orderNumber: 1,
      shopId: 1,
      shopName: 1,
      paymentMethod: 1,
      items: 1,
      subtotal: 1,
      total: 1,
      notes: 1,
      createdAt: 1,
    })
    .toArray();

  const existing = await invoicesCol
    .find({}, { projection: { orderId: 1 } })
    .toArray();
  const invoicedOrderIds = new Set(
    existing.map((doc: { orderId: Types.ObjectId }) => String(doc.orderId)),
  );

  const shopIdStrings = [
    ...new Set(
      orders
        .map((o: { shopId?: Types.ObjectId }) =>
          o.shopId ? String(o.shopId) : '',
        )
        .filter((id: string): id is string => id.length > 0),
    ),
  ];
  const shopObjectIds = shopIdStrings.map((id: string) => new Types.ObjectId(id));

  const shops = shopObjectIds.length
    ? await usersCol
        .find({ _id: { $in: shopObjectIds } })
        .project({
          shopName: 1,
          phone: 1,
          city: 1,
          address: 1,
        })
        .toArray()
    : [];
  const shopById = new Map(
    shops.map((s: { _id: Types.ObjectId }) => [String(s._id), s] as const),
  );

  const seller = sellerFromEnv();
  /** In-memory day → next sequence to avoid N+1 reads while seeding. */
  const seqByDay = new Map<string, number>();

  async function allocateInvoiceNumber(day: string): Promise<string> {
    const prefix = `INV-${day}-`;
    if (!seqByDay.has(day)) {
      const latest = await invoicesCol.findOne(
        { invoiceNumber: new RegExp(`^${prefix}`) },
        { sort: { invoiceNumber: -1 }, projection: { invoiceNumber: 1 } },
      );
      let seq = 1;
      if (latest?.invoiceNumber) {
        const tail = String(latest.invoiceNumber).slice(prefix.length);
        const n = parseInt(tail, 10);
        if (!Number.isNaN(n)) seq = n + 1;
      }
      seqByDay.set(day, seq);
    }
    const seq = seqByDay.get(day)!;
    seqByDay.set(day, seq + 1);
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  let created = 0;
  let skipped = 0;
  const samples: string[] = [];

  for (const order of orders) {
    if (invoicedOrderIds.has(String(order._id))) {
      skipped++;
      continue;
    }

    const shop = shopById.get(String(order.shopId)) as
      | {
          shopName?: string;
          phone?: string;
          city?: string;
          address?: string;
        }
      | undefined;

    const issuedAt = order.createdAt
      ? new Date(order.createdAt)
      : new Date();
    const day = issuedAt.toISOString().slice(0, 10).replace(/-/g, '');
    const invoiceNumber = await allocateInvoiceNumber(day);

    const items = Array.isArray(order.items)
      ? order.items.map(
          (line: {
            productId?: Types.ObjectId;
            title?: string;
            sku?: string;
            quantity?: number;
            unitPrice?: number;
            lineTotal?: number;
          }) => ({
            productId: line.productId,
            title: line.title || 'Item',
            sku: line.sku || '',
            quantity: line.quantity ?? 1,
            unitPrice: line.unitPrice ?? 0,
            lineTotal: line.lineTotal ?? 0,
          }),
        )
      : [];

    const now = new Date();
    try {
      await invoicesCol.insertOne({
        invoiceNumber,
        orderId: order._id,
        orderNumber: order.orderNumber,
        shopId: order.shopId,
        shopName: order.shopName || shop?.shopName || '',
        seller,
        buyer: {
          name: shop?.shopName || order.shopName || '',
          phone: shop?.phone || '',
          city: shop?.city || '',
          address: shop?.address || '',
          taxId: '',
        },
        items,
        subtotal: order.subtotal ?? order.total ?? 0,
        total: order.total ?? 0,
        paymentMethod: order.paymentMethod,
        status: InvoiceStatus.ISSUED,
        issuedAt,
        notes: typeof order.notes === 'string' ? order.notes.trim() : '',
        createdAt: now,
        updatedAt: now,
      });
      created++;
      invoicedOrderIds.add(String(order._id));
      if (samples.length < 8) samples.push(invoiceNumber);
    } catch (err: unknown) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? (err as { code?: number }).code
          : undefined;
      // Duplicate orderId / invoiceNumber — treat as already present.
      if (code === 11000) {
        skipped++;
        continue;
      }
      throw err;
    }
  }

  return { created, skipped, samples };
}

type OrderForReturn = {
  _id: Types.ObjectId;
  orderNumber: string;
  shopId: Types.ObjectId;
  shopName?: string;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  items: Array<{
    productId: Types.ObjectId;
    title?: string;
    sku?: string;
    quantity: number;
    unitPrice: number;
    lineTotal?: number;
  }>;
  statusHistory?: Array<{ status: string; at: Date; note?: string }>;
};

type ReturnSeedResult = {
  upserted: number;
  promotedOrders: number;
  byStatus: Record<string, number>;
};

/**
 * Ensure enough DELIVERED orders exist for sample returns (minimal status updates).
 */
async function ensureDeliveredOrdersForReturns(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ordersCol: any,
  needed: number,
): Promise<{ orders: OrderForReturn[]; promoted: number }> {
  const project = {
    _id: 1,
    orderNumber: 1,
    shopId: 1,
    shopName: 1,
    paymentMethod: 1,
    status: 1,
    items: 1,
    statusHistory: 1,
  };

  let delivered = (await ordersCol
    .find({
      status: OrderStatus.DELIVERED,
      'items.0': { $exists: true },
    })
    .project(project)
    .sort({ updatedAt: -1 })
    .limit(Math.max(needed * 2, 20))
    .toArray()) as OrderForReturn[];

  let promoted = 0;
  if (delivered.length < needed) {
    const candidates = (await ordersCol
      .find({
        status: { $ne: OrderStatus.DELIVERED },
        'items.0': { $exists: true },
      })
      .project(project)
      .sort({ createdAt: 1 })
      .limit(needed - delivered.length)
      .toArray()) as OrderForReturn[];

    const now = new Date();
    for (const order of candidates) {
      const history = Array.isArray(order.statusHistory)
        ? [...order.statusHistory]
        : [];
      const hasDelivered = history.some(
        (h) => h.status === OrderStatus.DELIVERED,
      );
      if (!hasDelivered) {
        history.push({
          status: OrderStatus.DELIVERED,
          at: now,
          note: 'Status → DELIVERED (seed for returns)',
        });
      }
      await ordersCol.updateOne(
        { _id: order._id },
        {
          $set: {
            status: OrderStatus.DELIVERED,
            statusHistory: history,
            updatedAt: now,
          },
        },
      );
      order.status = OrderStatus.DELIVERED;
      order.statusHistory = history;
      delivered.push(order);
      promoted++;
    }
  }

  return { orders: delivered, promoted };
}

function buildSeedReturnItems(
  order: OrderForReturn,
  partial: boolean,
): Array<{
  productId: Types.ObjectId;
  title: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}> {
  const lines = (order.items || []).filter(
    (line) => line?.productId && line.quantity > 0,
  );
  if (!lines.length) return [];

  if (partial) {
    const first = lines[0]!;
    const qty =
      first.quantity > 1 ? Math.max(1, Math.floor(first.quantity / 2)) : 1;
    const unitPrice = first.unitPrice;
    return [
      {
        productId: first.productId,
        title: first.title || 'Item',
        sku: first.sku || '',
        quantity: qty,
        unitPrice,
        lineTotal: Number((unitPrice * qty).toFixed(2)),
      },
    ];
  }

  // Full return of first line only keeps sample sizes modest; multi-item
  // partial scenarios already cover partial-item returns.
  if (lines.length >= 2 && partial === false) {
    return lines.slice(0, 2).map((line) => {
      const qty = line.quantity;
      const unitPrice = line.unitPrice;
      return {
        productId: line.productId,
        title: line.title || 'Item',
        sku: line.sku || '',
        quantity: qty,
        unitPrice,
        lineTotal: Number((unitPrice * qty).toFixed(2)),
      };
    });
  }

  return lines.map((line) => {
    const qty = line.quantity;
    const unitPrice = line.unitPrice;
    return {
      productId: line.productId,
      title: line.title || 'Item',
      sku: line.sku || '',
      quantity: qty,
      unitPrice,
      lineTotal: Number((unitPrice * qty).toFixed(2)),
    };
  });
}

/**
 * Idempotent sample return requests (match by exact [SEED]… reason).
 * Promotes a few orders to DELIVERED when needed. Does not restock/wallet
 * for APPROVED rows — those are historical demo snapshots only.
 */
async function upsertReturnRequests(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  adminId?: Types.ObjectId,
): Promise<ReturnSeedResult> {
  const ordersCol = db.collection('orders');
  const returnsCol = db.collection('return_requests');
  const usersCol = db.collection('users');

  await returnsCol.createIndex({ shopId: 1, createdAt: -1 });
  await returnsCol.createIndex({ orderId: 1 });
  await returnsCol.createIndex({ status: 1, createdAt: -1 });
  await returnsCol.createIndex({ reason: 1 });

  let resolvedAdminId = adminId;
  if (!resolvedAdminId) {
    const admin = await usersCol.findOne(
      { role: UserRole.ADMIN },
      { projection: { _id: 1 } },
    );
    resolvedAdminId = admin?._id as Types.ObjectId | undefined;
  }

  const { orders, promoted } = await ensureDeliveredOrdersForReturns(
    ordersCol,
    RETURN_SEED_SCENARIOS.length,
  );

  if (!orders.length) {
    console.warn('  no orders available to attach return requests');
    return { upserted: 0, promotedOrders: promoted, byStatus: {} };
  }

  const usedOrderIds = new Set<string>();
  const existingSeed = await returnsCol
    .find({ reason: { $regex: `^${RETURN_SEED_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } })
    .project({ reason: 1, orderId: 1 })
    .toArray();
  const existingByReason = new Map(
    existingSeed.map(
      (doc: { reason: string; orderId: Types.ObjectId }) =>
        [doc.reason, doc] as const,
    ),
  );
  for (const doc of existingSeed) {
    if (doc.orderId) usedOrderIds.add(String(doc.orderId));
  }

  function pickOrder(scenario: SeedReturnScenario): OrderForReturn | null {
    const existing = existingByReason.get(scenario.reason) as
      | { orderId: Types.ObjectId }
      | undefined;
    if (existing?.orderId) {
      const kept = orders.find(
        (o) => String(o._id) === String(existing.orderId),
      );
      if (kept) return kept;
    }

    const prefer = scenario.preferCredit;
    const ranked = [...orders].sort((a, b) => {
      const aItems = a.items?.length ?? 0;
      const bItems = b.items?.length ?? 0;
      if (scenario.partial) {
        const aPartial = a.items?.some((i) => i.quantity > 1) ? 1 : 0;
        const bPartial = b.items?.some((i) => i.quantity > 1) ? 1 : 0;
        if (bPartial !== aPartial) return bPartial - aPartial;
      }
      return bItems - aItems;
    });

    for (const order of ranked) {
      const id = String(order._id);
      if (usedOrderIds.has(id)) continue;
      if (prefer === true && order.paymentMethod !== PaymentMethod.CREDIT) {
        continue;
      }
      if (
        prefer === false &&
        order.paymentMethod !== PaymentMethod.CASH_ON_DELIVERY
      ) {
        continue;
      }
      return order;
    }

    // Fallback: any unused delivered order
    for (const order of ranked) {
      if (!usedOrderIds.has(String(order._id))) return order;
    }
    return ranked[0] ?? null;
  }

  let upserted = 0;
  const byStatus: Record<string, number> = {};
  const now = new Date();

  for (const scenario of RETURN_SEED_SCENARIOS) {
    const order = pickOrder(scenario);
    if (!order) continue;

    const items = buildSeedReturnItems(order, scenario.partial);
    if (!items.length) continue;

    usedOrderIds.add(String(order._id));
    const refundAmount = Number(
      items.reduce((sum, line) => sum + line.lineTotal, 0).toFixed(2),
    );

    let refundMethod: ReturnRefundMethod | undefined;
    const reviewedAt =
      scenario.status === ReturnRequestStatus.PENDING
        ? undefined
        : daysAgo(randInt(1, 10));

    if (scenario.status === ReturnRequestStatus.APPROVED) {
      refundMethod =
        order.paymentMethod === PaymentMethod.CREDIT
          ? ReturnRefundMethod.WALLET_CREDIT
          : ReturnRefundMethod.NONE;
    } else if (scenario.status === ReturnRequestStatus.REJECTED) {
      refundMethod = ReturnRefundMethod.NONE;
    }

    const $set: Record<string, unknown> = {
      shopId: order.shopId,
      shopName: order.shopName || '',
      orderId: order._id,
      orderNumber: order.orderNumber,
      paymentMethod: order.paymentMethod,
      items,
      refundAmount,
      reason: scenario.reason,
      status: scenario.status,
      adminNote: scenario.adminNote ?? '',
      updatedAt: now,
    };

    const $unset: Record<string, string> = {};

    if (refundMethod !== undefined) {
      $set['refundMethod'] = refundMethod;
    } else {
      $unset['refundMethod'] = '';
    }

    if (reviewedAt) {
      $set['reviewedAt'] = reviewedAt;
      if (resolvedAdminId) $set['reviewedBy'] = resolvedAdminId;
    } else {
      $unset['reviewedAt'] = '';
      $unset['reviewedBy'] = '';
    }

    const update: Record<string, unknown> = {
      $set,
      $setOnInsert: {
        createdAt: daysAgo(randInt(2, 20)),
      },
    };
    if (Object.keys($unset).length) update['$unset'] = $unset;

    const result = await returnsCol.updateOne(
      { reason: scenario.reason },
      update,
      { upsert: true },
    );

    if (result.upsertedCount > 0 || result.modifiedCount > 0) upserted++;
    byStatus[scenario.status] = (byStatus[scenario.status] ?? 0) + 1;
  }

  return { upserted, promotedOrders: promoted, byStatus };
}

/** Wipe + insert with retries — a live API may bootstrap brands/categories mid-seed. */
async function replaceDocs(
  col: { collectionName: string; deleteMany: (f: object) => Promise<unknown>; insertMany: (docs: object[]) => Promise<unknown> },
  docs: object[],
): Promise<void> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    await col.deleteMany({});
    if (!docs.length) return;
    try {
      await col.insertMany(docs);
      return;
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code !== 11000 || attempt === 4) throw err;
      console.warn(
        `  ${col.collectionName}: duplicate key race (attempt ${attempt}), retrying...`,
      );
    }
  }
}

type ProductDoc = {
  _id: Types.ObjectId;
  title: string;
  brand: string;
  model: string;
  category: string;
  part: string;
  qualityGrade: QualityGrade;
  stockQuantity: number;
  basePrice: number;
  tieredPricing: Array<{ minQty: number; price: number }>;
  imageUrl: string;
  sku: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type ShopDoc = {
  _id: Types.ObjectId;
  shopName: string;
  phone: string;
  status: UserStatus;
};

type OrderDoc = {
  _id: Types.ObjectId;
  orderNumber: string;
  shopId: Types.ObjectId;
  paymentMethod: PaymentMethod;
  total: number;
};

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min: number, max: number, decimals = 2): number {
  const v = Math.random() * (max - min) + min;
  return Number(v.toFixed(decimals));
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(randInt(8, 20), randInt(0, 59), randInt(0, 59), 0);
  return d;
}

function buildProducts(): ProductDoc[] {
  const products: ProductDoc[] = [];
  let skuCounter = 1;

  for (const [brand, models] of Object.entries(BRANDS)) {
    for (const model of models) {
      for (const category of CATEGORIES) {
        const gradeCount = randInt(1, 3);
        const grades = [...Object.values(QualityGrade)]
          .sort(() => Math.random() - 0.5)
          .slice(0, gradeCount);

        for (const qualityGrade of grades) {
          const part = rand(PART_NAMES);
          const title = `${model} ${part}`;
          const basePrice = randFloat(
            qualityGrade === QualityGrade.Original ? 40 : 5,
            qualityGrade === QualityGrade.Original ? 250 : 80,
          );
          const stockQuantity = randInt(0, 150);
          const tieredPricing =
            stockQuantity > 10
              ? [
                  { minQty: 5, price: Number((basePrice * 0.92).toFixed(2)) },
                  { minQty: 20, price: Number((basePrice * 0.85).toFixed(2)) },
                  { minQty: 50, price: Number((basePrice * 0.78).toFixed(2)) },
                ]
              : stockQuantity > 0
                ? [{ minQty: 5, price: Number((basePrice * 0.9).toFixed(2)) }]
                : [];

          const prefix = category.slice(0, 3).toUpperCase();
          const gradeCode = qualityGrade.slice(0, 3).toUpperCase();
          const sku = `${prefix}-${brand.slice(0, 3).toUpperCase()}-${model.replace(/\s+/g, '').slice(0, 6)}-${gradeCode}-${String(skuCounter++).padStart(4, '0')}`;

          products.push({
            _id: new Types.ObjectId(),
            title,
            brand,
            model,
            category,
            part,
            qualityGrade,
            stockQuantity,
            basePrice,
            tieredPricing,
            imageUrl: productImageFor(category),
            sku,
            isActive: Math.random() > 0.05,
            createdAt: daysAgo(randInt(1, 90)),
            updatedAt: daysAgo(randInt(0, 30)),
          });
        }
      }
    }
  }

  return products;
}

async function main(): Promise<void> {
  console.log(`Connecting to ${MONGODB_URI}...`);
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB connection failed');

  // Ensure local placeholder assets exist for seeded images (from tracked src/assets/uploads)
  const uploadsDir = join(process.cwd(), 'uploads');
  if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });

  const bundledDir = join(process.cwd(), 'src', 'assets', 'uploads');
  const requiredAssets = [
    'product-placeholder.png',
    'shop-placeholder.png',
    'admin-placeholder.png',
    'product-screens.png',
    'product-batteries.png',
    'product-charging.png',
    'product-covers.png',
    'product-cameras.png',
    'product-flex.png',
    'product-generic.png',
  ];
  const tinyPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5WlL8AAAAASUVORK5CYII=',
    'base64',
  );
  const preferredProduct = join(bundledDir, 'product-placeholder.png');
  const preferredShop = join(bundledDir, 'shop-placeholder.png');
  for (const name of requiredAssets) {
    const assetPath = join(uploadsDir, name);
    const bundledPath = join(bundledDir, name);
    // Prefer tracked bundled asset; recreate if missing or still the old 1×1 stub (~68 bytes)
    if (!existsSync(assetPath) || statSync(assetPath).size < 200) {
      if (existsSync(bundledPath) && statSync(bundledPath).size >= 200) {
        writeFileSync(assetPath, readFileSync(bundledPath));
        continue;
      }
      const source =
        name === 'shop-placeholder.png' || name === 'admin-placeholder.png'
          ? existsSync(preferredShop) && statSync(preferredShop).size >= 200
            ? preferredShop
            : preferredProduct
          : preferredProduct;
      if (existsSync(source) && statSync(source).size >= 200) {
        writeFileSync(assetPath, readFileSync(source));
      } else if (!existsSync(assetPath)) {
        writeFileSync(assetPath, tinyPng);
      }
    }
  }

  const users = db.collection('users');
  const productsCol = db.collection('products');
  const ordersCol = db.collection('orders');
  const walletsCol = db.collection('wallets');
  const specialCol = db.collection('special_requests');
  const brandsCol = db.collection('brands');
  const categoriesCol = db.collection('categories');

  if (RESET) {
    console.log('Resetting collections...');
    for (const name of COLLECTIONS) {
      // deleteMany keeps indexes and avoids races with a running API
      // that may recreate bootstrap docs between drop and insert.
      await db.collection(name).deleteMany({});
    }
  } else {
    const userCount = await users.countDocuments();
    if (userCount > 1) {
      console.log(
        `Database already has ${userCount} users. Skipping full seed.`,
      );
      console.log('Upserting delivery guys (additive)...');
      const deliveryGuysCol = db.collection('delivery_guys');
      const n = await upsertDeliveryGuys(deliveryGuysCol);
      console.log(`  ${n}/${DELIVERY_GUYS.length} delivery guys upserted`);
      for (const g of DELIVERY_GUYS) {
        console.log(`    ${g.phone}  ${g.fullName}  (${g.feeModel})`);
      }

      console.log('Upserting sample branches (additive)...');
      const branchesCol = db.collection('branches');
      const bn = await upsertBranches(branchesCol);
      console.log(`  ${bn}/${SAMPLE_BRANCHES.length} branches upserted`);
      for (const b of SAMPLE_BRANCHES) {
        console.log(`    ${b.code}  ${b.name}`);
      }

      console.log('Backfilling invoices for orders without one...');
      const inv = await backfillInvoices(db);
      console.log(
        `  invoices: ${inv.created} created, ${inv.skipped} skipped (already present)`,
      );
      if (inv.samples.length) {
        console.log(`  sample invoice numbers: ${inv.samples.join(', ')}`);
      }

      console.log('Upserting sample return requests (additive)...');
      const ret = await upsertReturnRequests(db);
      console.log(
        `  returns: ${ret.upserted} upserted` +
          (ret.promotedOrders
            ? ` (${ret.promotedOrders} orders promoted to DELIVERED)`
            : ''),
      );
      console.log(
        `  by status: ${Object.entries(ret.byStatus)
          .map(([s, n]) => `${s}=${n}`)
          .join(', ') || 'none'}`,
      );

      await mongoose.disconnect();
      return;
    }
  }

  console.log('Seeding admin...');
  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const adminId = new Types.ObjectId();
  // App bootstrap may recreate this admin while the seed is running.
  await users.deleteMany({ phone: ADMIN_PHONE });
  await users.insertOne({
    _id: adminId,
    fullName: 'Platform Admin',
    shopName: 'Qet3etak HQ',
    phone: ADMIN_PHONE,
    city: 'Riyadh',
    address: 'Head Office',
    commercialRegPhotoUrl: SHOP_IMAGE,
    passwordHash: adminHash,
    role: UserRole.ADMIN,
    status: UserStatus.APPROVED,
    createdAt: daysAgo(180),
    updatedAt: daysAgo(1),
  });

  console.log('Seeding shop owners...');
  const shopHash = await bcrypt.hash(SHOP_PASSWORD, 10);
  const shopDefs: Array<{
    phone: string;
    fullName: string;
    shopName: string;
    status: UserStatus;
    rejectionReason?: string;
  }> = [];

  for (let i = 1; i <= 40; i++) {
    shopDefs.push({
      phone: `0501${String(i).padStart(6, '0')}`,
      fullName: `Shop Owner ${i}`,
      shopName: `${rand(['Al', 'Golden', 'Royal', 'Smart', 'Pro', 'City'])} ${rand(['Mobile', 'Parts', 'Repair', 'Tech', 'Spare'])} ${i}`,
      status: UserStatus.APPROVED,
    });
  }
  for (let i = 1; i <= 12; i++) {
    shopDefs.push({
      phone: `0502${String(i).padStart(6, '0')}`,
      fullName: `Pending Owner ${i}`,
      shopName: `Pending Shop ${i}`,
      status: UserStatus.PENDING_VERIFICATION,
    });
  }
  for (let i = 1; i <= 8; i++) {
    shopDefs.push({
      phone: `0503${String(i).padStart(6, '0')}`,
      fullName: `Rejected Owner ${i}`,
      shopName: `Rejected Shop ${i}`,
      status: UserStatus.REJECTED,
      rejectionReason: 'Incomplete commercial registration documents',
    });
  }
  for (let i = 1; i <= 5; i++) {
    shopDefs.push({
      phone: `0504${String(i).padStart(6, '0')}`,
      fullName: `Suspended Owner ${i}`,
      shopName: `Suspended Shop ${i}`,
      status: UserStatus.SUSPENDED,
    });
  }

  const shops: ShopDoc[] = shopDefs.map((s) => ({
    _id: new Types.ObjectId(),
    shopName: s.shopName,
    phone: s.phone,
    status: s.status,
  }));

  await users.insertMany(
    shopDefs.map((s, idx) => ({
      _id: shops[idx]!._id,
      fullName: s.fullName,
      shopName: s.shopName,
      phone: s.phone,
      city: rand(CITIES),
      address: `${randInt(1, 999)} ${rand(['King Fahd Rd', 'Olaya St', 'Tahlia St', 'Prince Sultan Rd', 'Al Urubah Rd'])}, ${rand(CITIES)}`,
      commercialRegPhotoUrl: SHOP_IMAGE,
      passwordHash: shopHash,
      role: UserRole.SHOP_OWNER,
      status: s.status,
      rejectionReason: s.rejectionReason,
      createdAt: daysAgo(randInt(5, 120)),
      updatedAt: daysAgo(randInt(0, 14)),
    })),
  );

  const approvedShops = shops.filter((s) => s.status === UserStatus.APPROVED);
  console.log(`  ${shops.length} shops (${approvedShops.length} approved)`);

  console.log('Seeding brands...');
  const brandIcons: Record<string, string> = {
    Apple: 'https://cdn.simpleicons.org/apple/000000',
    Samsung: 'https://cdn.simpleicons.org/samsung/1428A0',
    Xiaomi: 'https://cdn.simpleicons.org/xiaomi/FF6900',
    Huawei: 'https://cdn.simpleicons.org/huawei/CF0A2C',
    Oppo: 'https://cdn.simpleicons.org/oppo/1BA784',
    OnePlus: 'https://cdn.simpleicons.org/oneplus/F5010C',
    Realme: 'https://cdn.simpleicons.org/realme/FFC915',
    Google: 'https://cdn.simpleicons.org/google/4285F4',
    Sony: 'https://cdn.simpleicons.org/sony/000000',
    Nokia: 'https://cdn.simpleicons.org/nokia/124191',
  };
  const brandDocs = Object.keys(BRANDS).map((name, idx) => ({
    _id: new Types.ObjectId(),
    name,
    iconUrl: brandIcons[name] ?? '',
    isActive: true,
    sortOrder: idx + 1,
    createdAt: daysAgo(100),
    updatedAt: daysAgo(1),
  }));
  await replaceDocs(brandsCol, brandDocs);
  console.log(`  ${brandDocs.length} brands`);

  console.log('Seeding categories...');
  const categoryDocs = CATEGORIES.map((name, idx) => ({
    _id: new Types.ObjectId(),
    name,
    iconUrl: '',
    isActive: true,
    sortOrder: idx + 1,
    createdAt: daysAgo(100),
    updatedAt: daysAgo(1),
  }));
  await replaceDocs(categoriesCol, categoryDocs);
  console.log(`  ${categoryDocs.length} categories`);

  console.log('Seeding products...');
  const products = buildProducts();
  await replaceDocs(productsCol, products);
  console.log(`  ${products.length} products`);

  type WalletTx = {
    _id: Types.ObjectId;
    type: WalletTxType;
    amount: number;
    balanceAfter: number;
    note: string;
    createdAt: Date;
    orderId?: Types.ObjectId;
    createdBy?: Types.ObjectId;
  };

  type WalletDoc = {
    _id: Types.ObjectId;
    shopId: Types.ObjectId;
    creditLimit: number;
    currentDebt: number;
    transactions: WalletTx[];
    createdAt: Date;
    updatedAt: Date;
  };

  console.log('Seeding wallets...');
  const walletDocs: WalletDoc[] = approvedShops.map((shop) => {
    const creditLimit = randInt(3000, 20000);
    return {
      _id: new Types.ObjectId(),
      shopId: shop._id,
      creditLimit,
      currentDebt: 0,
      transactions: [
        {
          _id: new Types.ObjectId(),
          type: WalletTxType.CREDIT_LIMIT_CHANGE,
          amount: creditLimit,
          balanceAfter: 0,
          note: `Initial credit limit set to ${creditLimit}`,
          createdBy: adminId,
          createdAt: daysAgo(randInt(30, 90)),
        },
      ],
      createdAt: daysAgo(randInt(30, 90)),
      updatedAt: daysAgo(randInt(0, 7)),
    };
  });
  await walletsCol.insertMany(walletDocs);
  console.log(`  ${walletDocs.length} wallets`);

  const walletByShopId = new Map(
    walletDocs.map((w) => [String(w.shopId), w] as const),
  );

  console.log('Seeding orders...');
  const activeProducts = products.filter((p) => p.isActive && p.stockQuantity > 0);
  const orderStatuses = Object.values(OrderStatus);
  const orderDocs: Array<Record<string, unknown> & OrderDoc> = [];
  let orderSeq = 1;

  for (const shop of approvedShops) {
    const orderCount = randInt(3, 12);
    for (let o = 0; o < orderCount; o++) {
      const itemCount = randInt(1, 5);
      const picked = [...activeProducts]
        .sort(() => Math.random() - 0.5)
        .slice(0, itemCount);

      const items = picked.map((product) => {
        const quantity = randInt(1, Math.min(10, product.stockQuantity));
        const unitPrice = product.basePrice;
        return {
          productId: product._id,
          title: product.title,
          sku: product.sku,
          qualityGrade: product.qualityGrade,
          quantity,
          unitPrice,
          lineTotal: Number((unitPrice * quantity).toFixed(2)),
        };
      });

      const total = Number(
        items.reduce((sum, line) => sum + line.lineTotal, 0).toFixed(2),
      );
      const status = rand(orderStatuses);
      const statusIdx = orderStatuses.indexOf(status);
      const created = daysAgo(randInt(1, 60));
      const statusHistory = orderStatuses.slice(0, statusIdx + 1).map((s, idx) => ({
        status: s,
        at: new Date(created.getTime() + idx * 3600_000 * randInt(4, 24)),
        note: `Status → ${s}`,
      }));

      const day = created.toISOString().slice(0, 10).replace(/-/g, '');
      orderDocs.push({
        _id: new Types.ObjectId(),
        orderNumber: `QT-${day}-${String(orderSeq++).padStart(5, '0')}`,
        shopId: shop._id,
        shopName: shop.shopName,
        status,
        paymentMethod:
          Math.random() > 0.35
            ? PaymentMethod.CREDIT
            : PaymentMethod.CASH_ON_DELIVERY,
        items,
        subtotal: total,
        total,
        notes: Math.random() > 0.7 ? 'Please call before delivery' : '',
        statusHistory,
        createdAt: created,
        updatedAt: statusHistory[statusHistory.length - 1]!.at,
      });
    }
  }

  await ordersCol.insertMany(orderDocs);
  console.log(`  ${orderDocs.length} orders`);

  console.log('Seeding invoices for orders...');
  const invSeed = await backfillInvoices(db);
  console.log(
    `  invoices: ${invSeed.created} created, ${invSeed.skipped} skipped`,
  );
  if (invSeed.samples.length) {
    console.log(`  sample invoice numbers: ${invSeed.samples.join(', ')}`);
  }

  console.log('Updating wallet debts from credit orders...');
  let creditApplied = 0;
  for (const order of orderDocs) {
    if (order.paymentMethod !== PaymentMethod.CREDIT) continue;
    const wallet = walletByShopId.get(String(order.shopId));
    if (!wallet) continue;

    const newDebt = Number((wallet.currentDebt + order.total).toFixed(2));
    if (newDebt > wallet.creditLimit) continue;

    wallet.currentDebt = newDebt;
    wallet.transactions.unshift({
      _id: new Types.ObjectId(),
      type: WalletTxType.CREDIT_PURCHASE,
      amount: order.total,
      balanceAfter: newDebt,
      note: `Pay later · ${order.orderNumber}`,
      orderId: order._id,
      createdAt: order['createdAt'] as Date,
    });
    creditApplied++;
  }
  console.log(`  applied ${creditApplied} credit charges`);

  console.log('Recording sample wallet payments...');
  let payments = 0;
  for (const wallet of walletDocs) {
    if (wallet.currentDebt <= 0) continue;
    if (Math.random() > 0.4) continue;
    const payment = Number(
      (wallet.currentDebt * randFloat(0.2, 0.6)).toFixed(2),
    );
    if (payment <= 0) continue;
    wallet.currentDebt = Number((wallet.currentDebt - payment).toFixed(2));
    wallet.transactions.unshift({
      _id: new Types.ObjectId(),
      type: WalletTxType.PAYMENT,
      amount: -payment,
      balanceAfter: wallet.currentDebt,
      note: 'Manual cash payment received',
      createdBy: adminId,
      createdAt: daysAgo(randInt(0, 20)),
    });
    payments++;
  }
  console.log(`  recorded ${payments} payments`);

  // Persist final wallet state
  for (const wallet of walletDocs) {
    await walletsCol.replaceOne({ _id: wallet._id }, wallet);
  }

  console.log('Seeding special requests...');
  const specialRequests: Array<Record<string, unknown>> = [];
  const srStatuses = Object.values(SpecialRequestStatus);

  for (const shop of approvedShops.slice(0, 30)) {
    const count = randInt(1, 4);
    for (let i = 0; i < count; i++) {
      const status = rand(srStatuses);
      const brand = rand(Object.keys(BRANDS));
      const deviceModel = rand(BRANDS[brand]!);
      const created = daysAgo(randInt(1, 45));
      const targetPrice = randFloat(50, 800);
      const doc: Record<string, unknown> = {
        _id: new Types.ObjectId(),
        shopId: shop._id,
        shopName: shop.shopName,
        deviceModel,
        partName: rand(SPECIAL_PARTS),
        quantity: randInt(1, 5),
        targetPrice,
        photoUrl: RARE_IMAGE,
        status,
        adminReply: '',
        createdAt: created,
        updatedAt: created,
      };

      if (
        status === SpecialRequestStatus.QUOTED ||
        status === SpecialRequestStatus.FULFILLED
      ) {
        doc['quotePrice'] = randFloat(targetPrice, targetPrice * 1.4);
        doc['estimatedArrival'] = daysAgo(-randInt(3, 14));
        doc['quotedAt'] = daysAgo(randInt(1, 10));
        doc['adminReply'] = 'We can source this part from our Dubai supplier.';
      }

      specialRequests.push(doc);
    }
  }

  await specialCol.insertMany(specialRequests);
  console.log(`  ${specialRequests.length} special requests`);

  console.log('Seeding delivery guys...');
  const deliveryGuysCol = db.collection('delivery_guys');
  const deliveryGuysUpserted = await upsertDeliveryGuys(deliveryGuysCol);
  console.log(`  ${deliveryGuysUpserted}/${DELIVERY_GUYS.length} delivery guys`);

  console.log('Seeding branches...');
  const branchesCol = db.collection('branches');
  const branchesUpserted = await upsertBranches(branchesCol);
  console.log(`  ${branchesUpserted}/${SAMPLE_BRANCHES.length} branches`);

  console.log('Seeding return requests...');
  const retSeed = await upsertReturnRequests(db, adminId);
  console.log(
    `  returns: ${retSeed.upserted} upserted` +
      (retSeed.promotedOrders
        ? ` (${retSeed.promotedOrders} orders → DELIVERED)`
        : ''),
  );
  console.log(
    `  by status: ${Object.entries(retSeed.byStatus)
      .map(([s, n]) => `${s}=${n}`)
      .join(', ') || 'none'}`,
  );

  // Unique indexes expected by the app
  await brandsCol.createIndex({ name: 1 }, { unique: true });
  await categoriesCol.createIndex({ name: 1 }, { unique: true });
  await users.createIndex({ phone: 1 }, { unique: true });
  await productsCol.createIndex({
    title: 'text',
    brand: 'text',
    model: 'text',
    category: 'text',
    part: 'text',
    sku: 'text',
  });
  await productsCol.createIndex({
    brand: 1,
    model: 1,
    category: 1,
    part: 1,
    qualityGrade: 1,
  });
  await ordersCol.createIndex({ orderNumber: 1 }, { unique: true });
  await walletsCol.createIndex({ shopId: 1 }, { unique: true });

  const invoiceCount = await db.collection('invoices').countDocuments();

  console.log('\nSeed complete!\n');
  console.log('Test accounts:');
  console.log(`  Admin   → phone: ${ADMIN_PHONE}  password: ${ADMIN_PASSWORD}`);
  console.log(`  Shop    → phone: 0501000001      password: ${SHOP_PASSWORD}`);
  console.log(`  Shop    → phone: 0501000020      password: ${SHOP_PASSWORD}`);
  console.log(`  Pending → phone: 0502000001      password: ${SHOP_PASSWORD}`);
  console.log(`  Rejected→ phone: 0503000001      password: ${SHOP_PASSWORD}`);
  console.log('\nDelivery guys:');
  for (const g of DELIVERY_GUYS) {
    console.log(`  ${g.phone}  ${g.fullName}  (${g.feeModel})`);
  }
  console.log('\nSummary:');
  console.log(`  Users:            ${shops.length + 1} (incl. admin)`);
  console.log(`  Brands:           ${brandDocs.length}`);
  console.log(`  Categories:       ${categoryDocs.length}`);
  console.log(`  Products:         ${products.length}`);
  console.log(`  Orders:           ${orderDocs.length}`);
  console.log(`  Invoices:         ${invoiceCount}`);
  console.log(`  Wallets:          ${walletDocs.length}`);
  console.log(`  Special requests: ${specialRequests.length}`);
  console.log(`  Delivery guys:    ${DELIVERY_GUYS.length}`);
  console.log(
    `  Return requests:  ${retSeed.upserted} (${Object.entries(retSeed.byStatus)
      .map(([s, n]) => `${s}=${n}`)
      .join(', ')})`,
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
