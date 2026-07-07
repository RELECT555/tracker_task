import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoginHandler } from './application/commands/login.handler';
import { RefreshTokenHandler } from './application/commands/refresh-token.handler';
import { GetMeHandler } from './application/queries/get-me.handler';
import { TokenService } from './infrastructure/token.service';
import { AuthController } from './presentation/auth.controller';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? 'dev-only-change-me',
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [TokenService, LoginHandler, RefreshTokenHandler, GetMeHandler],
  exports: [TokenService],
})
export class IdentityModule {}
