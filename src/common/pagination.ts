import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  /** Free-text search (products admin, etc.). */
  @ApiPropertyOptional({ example: 'samsung', description: 'Free-text search' })
  @IsOptional()
  @IsString()
  q?: string;
}

/** Pagination + optional status filter (shops / special-requests). */
export class PaginatedStatusQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: 'PENDING',
    description:
      'Status filter (context-specific: shops, special-requests, purchase-orders, …)',
  })
  @IsOptional()
  @IsString()
  status?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function normalizePagination(
  page?: number,
  limit?: number,
  defaultLimit = 20,
): { page: number; limit: number; skip: number } {
  const p = Math.max(1, Math.floor(page ?? 1) || 1);
  const l = Math.min(
    100,
    Math.max(1, Math.floor(limit ?? defaultLimit) || defaultLimit),
  );
  return { page: p, limit: l, skip: (p - 1) * l };
}

export function paginatedResult<T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResult<T> {
  return {
    items,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit) || 1),
  };
}
