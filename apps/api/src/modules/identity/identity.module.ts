import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoginHandler } from './application/commands/login.handler';
import { RefreshTokenHandler } from './application/commands/refresh-token.handler';
import { GetMeHandler } from './application/queries/get-me.handler';
import { IsActiveAdminHandler } from './application/queries/is-active-admin.handler';
import { TokenService } from './infrastructure/token.service';
import { AuthController } from './presentation/auth.controller';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { issuer: 'tracker-roadmap', algorithm: 'HS256' },
        verifyOptions: { issuer: 'tracker-roadmap', algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    TokenService,
    LoginHandler,
    RefreshTokenHandler,
    GetMeHandler,
    IsActiveAdminHandler,
  ],
  exports: [TokenService, IsActiveAdminHandler],
})
export class IdentityModule {}
