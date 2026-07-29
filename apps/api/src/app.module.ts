import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AdminModule } from './modules/admin/admin.module';
import { HealthModule } from './modules/health/health.module';
import { IdentityModule } from './modules/identity/identity.module';
import { RequestModule } from './modules/request/request.module';
import { RoutingModule } from './modules/routing/routing.module';
import { SlaModule } from './modules/sla/sla.module';
import { PrismaModule } from './shared/infrastructure/prisma/prisma.module';
import { AuthMiddleware } from './shared/presentation/middleware/auth.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    HealthModule,
    AdminModule,
    IdentityModule,
    RoutingModule,
    RequestModule,
    SlaModule,
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
      .forRoutes('requests', 'request-types', 'auth', 'admin', 'users');
  }
}
