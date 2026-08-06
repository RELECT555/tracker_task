import { Global, Module } from '@nestjs/common';
import { AdminChecker } from './admin.checker';

@Global()
@Module({
  providers: [AdminChecker],
  exports: [AdminChecker],
})
export class AccessModule {}
