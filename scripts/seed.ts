/**
 * Database seeder — populates MongoDB with realistic demo data.
 *
 * Usage:
 *   npm run seed          # seed only if collections are empty
 *   npm run seed:reset    # drop app collections and reseed from scratch
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import * as bcrypt from 'bcrypt';
import mongoose, { Types } from 'mongoose';
import { OrderStatus, PaymentMethod, WalletTxType } from '../src/common/enums/order.enums';
import { QualityGrade } from '../src/common/enums/product.enums';
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
  'wallets',
  'special_requests',
  'push_subscriptions',
  'brands',
  'categories',
] as const;

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

  // Ensure local placeholder assets exist for seeded images
  const uploadsDir = join(process.cwd(), 'uploads');
  if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });

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
  const preferredProduct = join(uploadsDir, 'product-placeholder.png');
  const preferredShop = join(uploadsDir, 'shop-placeholder.png');
  for (const name of requiredAssets) {
    const assetPath = join(uploadsDir, name);
    // Recreate if missing or still the old 1×1 stub (~68 bytes)
    if (!existsSync(assetPath) || statSync(assetPath).size < 200) {
      const source =
        name === 'shop-placeholder.png' || name === 'admin-placeholder.png'
          ? existsSync(preferredShop) && statSync(preferredShop).size >= 200
            ? preferredShop
            : preferredProduct
          : preferredProduct;
      if (existsSync(source) && statSync(source).size >= 200 && source !== assetPath) {
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
      const exists = await db.listCollections({ name }).hasNext();
      if (exists) await db.dropCollection(name);
    }
  } else {
    const userCount = await users.countDocuments();
    if (userCount > 1) {
      console.log(
        `Database already has ${userCount} users. Use npm run seed:reset to wipe and reseed.`,
      );
      await mongoose.disconnect();
      return;
    }
  }

  console.log('Seeding admin...');
  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const adminId = new Types.ObjectId();
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
  await brandsCol.insertMany(brandDocs);
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
  await categoriesCol.insertMany(categoryDocs);
  console.log(`  ${categoryDocs.length} categories`);

  console.log('Seeding products...');
  const products = buildProducts();
  await productsCol.insertMany(products);
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

  console.log('\nSeed complete!\n');
  console.log('Test accounts:');
  console.log(`  Admin   → phone: ${ADMIN_PHONE}  password: ${ADMIN_PASSWORD}`);
  console.log(`  Shop    → phone: 0501000001      password: ${SHOP_PASSWORD}`);
  console.log(`  Shop    → phone: 0501000020      password: ${SHOP_PASSWORD}`);
  console.log(`  Pending → phone: 0502000001      password: ${SHOP_PASSWORD}`);
  console.log(`  Rejected→ phone: 0503000001      password: ${SHOP_PASSWORD}`);
  console.log('\nSummary:');
  console.log(`  Users:            ${shops.length + 1} (incl. admin)`);
  console.log(`  Brands:           ${brandDocs.length}`);
  console.log(`  Categories:       ${categoryDocs.length}`);
  console.log(`  Products:         ${products.length}`);
  console.log(`  Orders:           ${orderDocs.length}`);
  console.log(`  Wallets:          ${walletDocs.length}`);
  console.log(`  Special requests: ${specialRequests.length}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
