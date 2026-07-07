import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateAdminRequestTypeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsArray()
  fieldSchema?: Record<string, unknown>[];

  @IsOptional()
  @IsUUID()
  defaultRouteTemplateId?: string | null;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  allowedManualRoutes?: string[];

  @IsOptional()
  @IsBoolean()
  allowsPersonalRoute?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxPersonalRouteSteps?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAdminRequestTypeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsArray()
  fieldSchema?: Record<string, unknown>[];

  @IsOptional()
  @IsUUID()
  defaultRouteTemplateId?: string | null;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  allowedManualRoutes?: string[];

  @IsOptional()
  @IsBoolean()
  allowsPersonalRoute?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxPersonalRouteSteps?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
