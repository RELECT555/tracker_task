import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { REQUEST_PRIORITIES, type RequestPriority } from '@tracker/shared';

export class UpdateRequestDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsObject()
  fields?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(REQUEST_PRIORITIES)
  priority?: RequestPriority;
}

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

export class InboxQueryDto {
  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;

  @IsOptional()
  @IsEnum(['sla', 'recent'])
  sort?: 'sla' | 'recent';
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

export class PersonalRouteStepDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @IsUUID()
  assigneeUserId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  slaHours?: number | null;
}

export class SubmitRequestDto {
  @IsOptional()
  @IsUUID()
  routeTemplateId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PersonalRouteStepDto)
  personalSteps?: PersonalRouteStepDto[];
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
