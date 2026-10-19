import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthModule } from './modules/health/health.module';
import { IdentityModule } from './modules/identity/identity.module';
import { RoadmapModule } from './modules/roadmap/roadmap.module';
import { PrismaModule } from './shared/infrastructure/prisma/prisma.module';
import { SystemSettingsModule } from './shared/infrastructure/system-settings/system-settings.module';
import { AuthMiddleware } from './shared/presentation/middleware/auth.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    SystemSettingsModule,
    HealthModule,
    IdentityModule,
    RoadmapModule,
  ],
  providers: [AuthMiddleware],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(AuthMiddleware)
      .exclude(
        { path: 'auth/login', method: RequestMethod.POST },
        { path: 'auth/refresh', method: RequestMethod.POST },
      )
      .forRoutes('auth', 'users', 'roadmap');
  }
}
