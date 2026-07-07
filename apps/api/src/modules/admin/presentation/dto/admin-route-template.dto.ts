import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RouteStepDto {
  @IsInt()
  order!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @IsString()
  assigneeType!: string;

  @IsString()
  assigneeRef!: string;

  @IsOptional()
  @IsArray()
  actions?: string[];

  @IsOptional()
  slaHours?: number | null;
}

export class CreateAdminRouteTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RouteStepDto)
  steps!: RouteStepDto[];

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class UpdateAdminRouteTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RouteStepDto)
  steps?: RouteStepDto[];
}
