export enum EmployeeStatus {
  ACTIVE = 'ACTIVE',
  ON_LEAVE = 'ON_LEAVE',
  TERMINATED = 'TERMINATED',
}

export enum VacationType {
  ANNUAL = 'ANNUAL',
  SICK = 'SICK',
  UNPAID = 'UNPAID',
}

export enum VacationStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum ExpenseSource {
  MANUAL = 'MANUAL',
  PAYROLL = 'PAYROLL',
}

export enum PayrollAdjustmentType {
  BONUS = 'BONUS',
  DEDUCTION = 'DEDUCTION',
}

/** JWT / guard role for the employee portal (not an admin UserRole). */
export const EMPLOYEE_ROLE = 'EMPLOYEE' as const;
