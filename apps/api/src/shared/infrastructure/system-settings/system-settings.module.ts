import { Global, Module } from '@nestjs/common';
import { SystemSettingsReader } from './system-settings.reader';

@Global()
@Module({
  providers: [SystemSettingsReader],
  exports: [SystemSettingsReader],
})
export class SystemSettingsModule {}
