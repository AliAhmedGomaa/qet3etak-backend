/**
 * Central OpenAPI request / response examples for Swagger UI.
 * Controllers reference these via `@ApiBody({ examples })` / `@ApiOkResponse({ examples })`.
 */

export const SwaggerExamples = {
  // ── Health ──────────────────────────────────────────────────────────────
  healthRoot: {
    summary: 'API root',
    value: { ok: true, service: 'qet3etak-api' },
  },
  healthOk: {
    summary: 'Health check',
    value: { status: 'ok' },
  },

  // ── Auth ────────────────────────────────────────────────────────────────
  loginRequest: {
    summary: 'Admin login',
    value: { phone: '0500000000', password: 'Admin123!' },
  },
  loginShopRequest: {
    summary: 'Shop owner login',
    value: { phone: '+201555541096', password: 'Shop123!' },
  },
  loginResponse: {
    summary: 'JWT issued',
    value: {
      accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      user: {
        id: '6a5ecf01f718e30c208e48c7',
        phone: '0500000000',
        role: 'ADMIN',
        status: 'APPROVED',
        fullName: 'System Admin',
        shopName: '',
      },
    },
  },
  registerShopRequest: {
    summary: 'Register shop (JSON fields; also send commercialRegPhoto file)',
    value: {
      fullName: 'Ahmed Hassan',
      shopName: 'Hassan Mobile Parts',
      phone: '01001234567',
      city: 'Cairo',
      address: '12 Tahrir St, Downtown',
      password: 'Shop123!',
    },
  },
  registerShopResponse: {
    summary: 'Pending verification',
    value: {
      id: '6a5ecf01f718e30c208e48c7',
      fullName: 'Ahmed Hassan',
      shopName: 'Hassan Mobile Parts',
      phone: '01001234567',
      status: 'PENDING_VERIFICATION',
      role: 'SHOP_OWNER',
    },
  },
  meResponse: {
    summary: 'Current user',
    value: {
      id: '6a5ecf01f718e30c208e48c7',
      fullName: 'Ahmed Hassan',
      shopName: 'Hassan Mobile Parts',
      phone: '+201555541096',
      role: 'SHOP_OWNER',
      status: 'APPROVED',
      city: 'Cairo',
      address: '12 Tahrir St',
    },
  },

  // ── Pagination ──────────────────────────────────────────────────────────
  paginatedEmpty: {
    summary: 'Empty page',
    value: { items: [], page: 1, limit: 20, total: 0, totalPages: 1 },
  },

  // ── Catalog / products ──────────────────────────────────────────────────
  catalogProduct: {
    summary: 'Catalog product card',
    value: {
      id: '6a5ed4b2f718e30c208e48d0',
      title: 'iPhone 14 LCD Assembly',
      brand: 'Apple',
      model: 'iPhone 14',
      category: 'Screens',
      part: 'LCD Assembly',
      qualityGrade: 'Original',
      stockQuantity: 42,
      basePrice: 85,
      tieredPricing: [
        { minQty: 5, price: 78 },
        { minQty: 20, price: 72 },
      ],
      imageUrl: 'http://localhost:3000/uploads/product-placeholder.png',
      sku: 'SCR-IP14-ORG',
      stockLabel: 'In Stock',
      discountMatrix: [
        { label: '1–4', minQty: 1, maxQty: 4, price: 85 },
        { label: '5–19', minQty: 5, maxQty: 19, price: 78 },
        { label: '20+', minQty: 20, maxQty: null, price: 72 },
      ],
    },
  },
  catalogResponse: {
    summary: 'Paginated catalog',
    value: {
      items: [
        {
          id: '6a5ed4b2f718e30c208e48d0',
          title: 'iPhone 14 LCD Assembly',
          brand: 'Apple',
          model: 'iPhone 14',
          category: 'Screens',
          qualityGrade: 'Original',
          stockQuantity: 42,
          basePrice: 85,
          imageUrl: 'http://localhost:3000/uploads/product-placeholder.png',
          discountMatrix: [],
          stockLabel: 'In Stock',
        },
      ],
      page: 1,
      limit: 24,
      total: 1,
      totalPages: 1,
    },
  },
  catalogFacets: {
    summary: 'Facet values',
    value: {
      brand: ['Apple', 'Samsung'],
      model: ['iPhone 14', 'Galaxy S23'],
      category: ['Screens', 'Batteries'],
      part: ['LCD Assembly', 'Battery Pack'],
      qualityGrade: ['Original', 'HighCopy', 'Copy', 'Used'],
    },
  },
  calculateCartRequest: {
    summary: 'Cart lines',
    value: {
      items: [
        { productId: '6a5ed4b2f718e30c208e48d0', quantity: 5 },
        { productId: '6a5ed4b2f718e30c208e48d1', quantity: 2 },
      ],
    },
  },
  calculateCartResponse: {
    summary: 'Priced cart',
    value: {
      lines: [
        {
          productId: '6a5ed4b2f718e30c208e48d0',
          title: 'iPhone 14 LCD Assembly',
          quantity: 5,
          basePrice: 85,
          unitPrice: 78,
          lineTotal: 390,
          appliedMinQty: 5,
          isTiered: true,
        },
      ],
      subtotal: 390,
      currency: 'EGP',
    },
  },
  quoteResponse: {
    summary: 'Single-line quote',
    value: {
      productId: '6a5ed4b2f718e30c208e48d0',
      quantity: 10,
      basePrice: 85,
      unitPrice: 78,
      lineTotal: 780,
      appliedMinQty: 5,
      isTiered: true,
      stockQuantity: 42,
      discountMatrix: [],
    },
  },
  createProductRequest: {
    summary: 'Create product (JSON fields; also send `image` file)',
    value: {
      title: 'Samsung S23 Battery',
      brand: 'Samsung',
      model: 'Galaxy S23',
      category: 'Batteries',
      part: 'Battery Pack',
      qualityGrade: 'Original',
      stockQuantity: 100,
      basePrice: 28,
      tieredPricing: JSON.stringify([
        { minQty: 10, price: 24 },
        { minQty: 50, price: 21 },
      ]),
      sku: 'BAT-S23-ORG',
      isActive: true,
    },
  },

  // ── Brands / categories ─────────────────────────────────────────────────
  brand: {
    summary: 'Brand',
    value: {
      id: '6a5e04e311d9cd2142b060cb',
      name: 'Samsung',
      iconUrl: 'http://localhost:3000/uploads/brand-123.png',
      isActive: true,
      sortOrder: 2,
    },
  },
  createBrandRequest: {
    summary: 'Create brand (optional `icon` file)',
    value: { name: 'Nothing', sortOrder: 11, isActive: true },
  },
  category: {
    summary: 'Category',
    value: {
      id: '6a5e04e311d9cd2142b060d5',
      name: 'Batteries',
      iconUrl: '',
      isActive: true,
      sortOrder: 2,
    },
  },
  createCategoryRequest: {
    summary: 'Create category (optional `icon` file)',
    value: { name: 'Microphones', sortOrder: 11, isActive: true },
  },

  // ── Orders ──────────────────────────────────────────────────────────────
  checkoutRequest: {
    summary: 'Checkout with cash on delivery',
    value: {
      items: [{ productId: '6a5ed4b2f718e30c208e48d0', quantity: 2 }],
      paymentMethod: 'CASH_ON_DELIVERY',
      notes: 'Deliver before noon',
    },
  },
  checkoutCreditRequest: {
    summary: 'Checkout on credit',
    value: {
      items: [{ productId: '6a5ed4b2f718e30c208e48d0', quantity: 5 }],
      paymentMethod: 'CREDIT',
    },
  },
  orderResponse: {
    summary: 'Order',
    value: {
      id: '6a5ed964049dba03886e80e8',
      orderNumber: 'QT-20260721-00307',
      shopId: '6a5ecf01f718e30c208e48c7',
      shopName: 'Hassan Mobile Parts',
      status: 'RECEIVED',
      paymentMethod: 'CASH_ON_DELIVERY',
      items: [
        {
          productId: '6a5ed4b2f718e30c208e48d0',
          title: 'lcd sam s20',
          sku: '',
          qualityGrade: 'Original',
          quantity: 2,
          unitPrice: 6900,
          lineTotal: 13800,
        },
      ],
      subtotal: 13800,
      total: 13800,
      statusHistory: [
        { status: 'RECEIVED', at: '2026-07-21T02:24:00.000Z', note: 'Order placed' },
      ],
      notes: '',
      createdAt: '2026-07-21T02:24:00.000Z',
    },
  },
  updateOrderStatusRequest: {
    summary: 'Move to preparing',
    value: { status: 'PREPARING', note: 'Picking items' },
  },

  // ── Wallets ─────────────────────────────────────────────────────────────
  walletResponse: {
    summary: 'Wallet view',
    value: {
      id: '6a5ecf01f718e30c208e48c8',
      shopId: '6a5ecf01f718e30c208e48c7',
      creditLimit: 50000,
      currentDebt: 13800,
      availableCredit: 36200,
      utilization: 0.276,
      transactions: [
        {
          type: 'CHARGE',
          amount: 13800,
          balanceAfter: 13800,
          note: 'Pay later · QT-20260721-00307',
          createdAt: '2026-07-21T02:24:00.000Z',
        },
      ],
      transactionsMeta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    },
  },
  setCreditLimitRequest: {
    summary: 'Set credit limit',
    value: { creditLimit: 75000, note: 'Trusted shop — raise limit' },
  },
  recordPaymentRequest: {
    summary: 'Record debt payment',
    value: { amount: 5000, note: 'Cash collection 21 Jul' },
  },

  // ── Special requests ────────────────────────────────────────────────────
  createSpecialRequest: {
    summary: 'Rare part request (also send `photo` file)',
    value: {
      deviceModel: 'iPhone 13 Pro',
      partName: 'True Tone Flex',
      quantity: 3,
      targetPrice: 120,
    },
  },
  specialRequest: {
    summary: 'Special request',
    value: {
      id: '6a5ed964049dba03886e80f0',
      shopId: '6a5ecf01f718e30c208e48c7',
      shopName: 'Hassan Mobile Parts',
      deviceModel: 'iPhone 13 Pro',
      partName: 'True Tone Flex',
      quantity: 3,
      targetPrice: 120,
      photoUrl: 'http://localhost:3000/uploads/rare-123.png',
      status: 'PENDING',
      adminReply: '',
      createdAt: '2026-07-21T03:00:00.000Z',
    },
  },
  quoteSpecialRequest: {
    summary: 'Admin quote',
    value: {
      quotePrice: 145,
      estimatedArrival: '2026-08-01',
      adminReply: 'Genuine flex arriving next week',
    },
  },

  // ── Push ────────────────────────────────────────────────────────────────
  vapidPublicKey: {
    summary: 'VAPID public key',
    value: {
      publicKey:
        'BEwvGrmoRuZIbIxZDO1OD-3lSkn6TSdypiYIeEVfZmdQMTToHcygs8hUJWFonzbnueUmcuLIgYRbecoVg7EvcQw',
    },
  },
  pushSubscribeRequest: {
    summary: 'Browser push subscription',
    value: {
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
      keys: {
        p256dh: 'BNcRd...',
        auth: 'tBHIt...',
      },
    },
  },
  pushUnsubscribeRequest: {
    summary: 'Unsubscribe by endpoint',
    value: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123' },
  },
  broadcastRequest: {
    summary: 'Broadcast to selected shops (omit shopIds for all)',
    value: {
      title: 'New stock arrived',
      body: 'iPhone 15 screens now available',
      url: '/catalog?brand=Apple',
      shopIds: ['6a5ed4b2f718e30c208e48d0'],
    },
  },
  broadcastResponse: {
    summary: 'Broadcast result',
    value: { targeted: 12, sent: 18, failed: 1, enabled: true },
  },

  // ── Chat ────────────────────────────────────────────────────────────────
  sendMessageRequest: {
    summary: 'Chat message',
    value: { text: 'هل الشاشة أصلية؟' },
  },
  messageResponse: {
    summary: 'Saved message',
    value: {
      id: '6a5ed964049dba03886e80f1',
      conversationId: '6a5ed964049dba03886e80f2',
      senderRole: 'SHOP_OWNER',
      text: 'هل الشاشة أصلية؟',
      createdAt: '2026-07-21T04:00:00.000Z',
    },
  },

  // ── Admin shops ─────────────────────────────────────────────────────────
  updateShopStatusApprove: {
    summary: 'Approve / reactivate shop',
    value: { status: 'APPROVED' },
  },
  updateShopStatusReject: {
    summary: 'Reject shop',
    value: {
      status: 'REJECTED',
      reason: 'Commercial registration photo is unclear',
    },
  },
  updateShopStatusSuspend: {
    summary: 'Suspend shop',
    value: { status: 'SUSPENDED' },
  },
  shopListItem: {
    summary: 'Shop row',
    value: {
      id: '6a5ecf01f718e30c208e48c7',
      fullName: 'Ahmed Hassan',
      shopName: 'Hassan Mobile Parts',
      phone: '+201555541096',
      city: 'Cairo',
      status: 'PENDING_VERIFICATION',
      commercialRegPhotoUrl: 'http://localhost:3000/uploads/shop-123.png',
    },
  },

  // ── Purchasing ──────────────────────────────────────────────────────────
  createSupplierRequest: {
    summary: 'Create supplier',
    value: {
      name: 'Shenzhen Parts Co',
      phone: '+8613800138000',
      country: 'CN',
      currency: 'USD',
      currentBalance: 0,
    },
  },
  supplierPaymentRequest: {
    summary: 'Pay supplier',
    value: { amount: 1500, note: 'Wire transfer Jul batch' },
  },
  createPurchaseOrderRequest: {
    summary: 'Create PO',
    value: {
      supplierId: '6a5ed964049dba03886e80f3',
      orderDate: '2026-07-20',
      status: 'DRAFT',
      items: [
        {
          productId: '6a5ed4b2f718e30c208e48d0',
          quantity: 100,
          unitPurchasePrice: 45,
        },
      ],
      extraCosts: { shippingFee: 200, customsFee: 150, otherExpenses: 0 },
      notes: 'Sea freight',
    },
  },
  updatePurchaseOrderStatusRequest: {
    summary: 'Mark received (increments stock)',
    value: { status: 'RECEIVED' },
  },

  // ── Financials ──────────────────────────────────────────────────────────
  createExpenseRequest: {
    summary: 'Record expense',
    value: {
      category: 'RENT',
      amount: 8000,
      date: '2026-07-01',
      description: 'Warehouse July rent',
    },
  },
  damagedStockRequest: {
    summary: 'Write off damaged stock',
    value: {
      productId: '6a5ed4b2f718e30c208e48d0',
      quantity: 2,
      description: 'Cracked units from shipment',
    },
  },
  pnlResponse: {
    summary: 'P&L summary',
    value: {
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      revenue: 125000,
      cogs: 78000,
      grossProfit: 47000,
      expenses: 18000,
      netProfit: 29000,
    },
  },

  // ── Errors ──────────────────────────────────────────────────────────────
  unauthorized: {
    summary: 'Missing / invalid token',
    value: {
      message: 'Authentication required',
      error: 'Unauthorized',
      statusCode: 401,
    },
  },
  forbiddenPending: {
    summary: 'Shop not approved',
    value: {
      code: 'PENDING_VERIFICATION',
      message: 'Account is pending management review',
      statusCode: 403,
    },
  },
  forbiddenSuspended: {
    summary: 'Shop suspended',
    value: {
      code: 'SUSPENDED',
      message:
        'Account suspended / الحساب موقوف — تواصل مع الإدارة لإعادة التفعيل',
      statusCode: 403,
    },
  },
  notFound: {
    summary: 'Resource missing',
    value: {
      message: 'Order not found',
      error: 'Not Found',
      statusCode: 404,
    },
  },
  validationError: {
    summary: 'Validation failed',
    value: {
      message: ['phone must be a valid phone number'],
      error: 'Bad Request',
      statusCode: 400,
    },
  },
} as const;

/** Helper: wrap a single example for `@ApiBody({ examples })`. */
export function ex(
  key: keyof typeof SwaggerExamples,
): Record<string, { summary: string; value: unknown }> {
  const e = SwaggerExamples[key];
  return { [key]: { summary: e.summary, value: e.value } };
}

/** Merge several named examples. */
export function examples(
  ...keys: Array<keyof typeof SwaggerExamples>
): Record<string, { summary: string; value: unknown }> {
  return Object.fromEntries(
    keys.map((key) => {
      const e = SwaggerExamples[key];
      return [key, { summary: e.summary, value: e.value }];
    }),
  );
}
