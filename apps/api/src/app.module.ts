import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './modules/health/health.module';
import { RequestModule } from './modules/request/request.module';
import { RoutingModule } from './modules/routing/routing.module';
import { PrismaModule } from './shared/infrastructure/prisma/prisma.module';
import { DevUserMiddleware } from './shared/presentation/middleware/dev-user.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    RoutingModule,
    RequestModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(DevUserMiddleware)
      .forRoutes('requests', 'request-types');
  }
}
