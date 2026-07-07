import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { REQUEST_PRIORITIES, type RequestPriority } from '@tracker/shared';

export class CreateRequestDto {
  @IsUUID()
  typeId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title!: string;

  @IsOptional()
  @IsObject()
  fields?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(REQUEST_PRIORITIES)
  priority?: RequestPriority;

  @IsOptional()
  @IsUUID()
  routeTemplateId?: string | null;
}

export class OutboxQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;
}
