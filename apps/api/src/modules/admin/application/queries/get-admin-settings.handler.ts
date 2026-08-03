import { Injectable } from '@nestjs/common';
import {
  SystemSettingsReader,
  type AdminSettingsView,
} from '../../../../shared/infrastructure/system-settings/system-settings.reader';

@Injectable()
export class GetAdminSettingsHandler {
  constructor(private readonly settings: SystemSettingsReader) {}

  execute(): Promise<AdminSettingsView> {
    return this.settings.getAdminSettings();
  }
}
