import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AgentModule } from './modules/agent/agent.module';
import { HealthModule } from './modules/health/health.module';
import { IdentityModule } from './modules/identity/identity.module';
import { RoadmapModule } from './modules/roadmap/roadmap.module';
import { validateAuthConfig } from './shared/infrastructure/config/auth-config';
import { PrismaModule } from './shared/infrastructure/prisma/prisma.module';
import { AuthMiddleware } from './shared/presentation/middleware/auth.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateAuthConfig }),
    ScheduleModule.forRoot(),
    PrismaModule,
    HealthModule,
    IdentityModule,
    RoadmapModule,
    AgentModule,
  ],
  providers: [AuthMiddleware],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(AuthMiddleware)
      .exclude(
        { path: 'auth/config', method: RequestMethod.GET },
        { path: 'auth/login', method: RequestMethod.POST },
        { path: 'auth/refresh', method: RequestMethod.POST },
        // Azure DevOps service hooks authenticate with the shared webhook secret instead.
        { path: 'roadmap/webhooks/azure-devops', method: RequestMethod.POST },
      )
      .forRoutes('auth', 'roadmap', 'ai');
  }
}
