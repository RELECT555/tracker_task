import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateAdminSettingsDto {
  @IsOptional()
  @IsBoolean()
  slaAutoEscalationEnabled?: boolean;
}
