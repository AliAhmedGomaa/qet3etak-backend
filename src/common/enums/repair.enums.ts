export enum RepairTicketStatus {
  RECEIVED = 'RECEIVED',
  DIAGNOSING = 'DIAGNOSING',
  WAITING_FOR_PARTS = 'WAITING_FOR_PARTS',
  REPAIRING = 'REPAIRING',
  READY = 'READY',
  DELIVERED = 'DELIVERED',
}

export enum RepairTicketSource {
  SHOP = 'SHOP',
  C2B_BOOKING = 'C2B_BOOKING',
}

export enum RepairBookingStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  CANCELLED = 'CANCELLED',
}

export type RepairIssueDef = {
  code: string;
  labelAr: string;
  labelEn: string;
  costMin: number;
  costMax: number;
};

/** Static issue catalog for the public estimator. */
export const REPAIR_ISSUE_CATALOG: RepairIssueDef[] = [
  {
    code: 'SCREEN',
    labelAr: 'استبدال الشاشة',
    labelEn: 'Screen replacement',
    costMin: 400,
    costMax: 2500,
  },
  {
    code: 'BATTERY',
    labelAr: 'استبدال البطارية',
    labelEn: 'Battery',
    costMin: 200,
    costMax: 900,
  },
  {
    code: 'CHARGING_PORT',
    labelAr: 'منفذ الشحن',
    labelEn: 'Charging port',
    costMin: 150,
    costMax: 700,
  },
  {
    code: 'CAMERA',
    labelAr: 'الكاميرا',
    labelEn: 'Camera',
    costMin: 250,
    costMax: 1200,
  },
  {
    code: 'SPEAKER',
    labelAr: 'السماعة',
    labelEn: 'Speaker',
    costMin: 100,
    costMax: 500,
  },
  {
    code: 'SOFTWARE',
    labelAr: 'برمجيات / سوفتوير',
    labelEn: 'Software',
    costMin: 50,
    costMax: 300,
  },
  {
    code: 'OTHER',
    labelAr: 'أخرى',
    labelEn: 'Other',
    costMin: 100,
    costMax: 1500,
  },
];

export const REPAIR_STATUS_FLOW: RepairTicketStatus[] = [
  RepairTicketStatus.RECEIVED,
  RepairTicketStatus.DIAGNOSING,
  RepairTicketStatus.WAITING_FOR_PARTS,
  RepairTicketStatus.REPAIRING,
  RepairTicketStatus.READY,
  RepairTicketStatus.DELIVERED,
];

export function repairIssueByCode(code: string): RepairIssueDef | undefined {
  return REPAIR_ISSUE_CATALOG.find((i) => i.code === code);
}
