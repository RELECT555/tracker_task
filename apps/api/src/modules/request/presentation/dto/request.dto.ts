import {
  IsBoolean,
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

export class SubmitRequestDto {
  @IsOptional()
  @IsUUID()
  routeTemplateId?: string;
}

export class ApproveRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class RejectRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason!: string;
}

export class CancelRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

export class RequestInfoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message!: string;
}

export class ProvideInfoDto {
  @IsOptional()
  @IsObject()
  fields?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class EscalateRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason!: string;
}

export class AddCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;

  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;
}
