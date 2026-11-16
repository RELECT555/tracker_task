import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoginHandler } from './application/commands/login.handler';
import { RefreshTokenHandler } from './application/commands/refresh-token.handler';
import { GetAuthConfigHandler } from './application/queries/get-auth-config.handler';
import { GetMeHandler } from './application/queries/get-me.handler';
import { IsActiveAdminHandler } from './application/queries/is-active-admin.handler';
import { authProviderOf } from '../../shared/infrastructure/config/auth-config';
import { AuthUserResolver } from './application/auth-user-resolver';
import {
  ACCESS_TOKEN_VERIFIER,
  LocalTokenVerifier,
} from './infrastructure/access-token-verifier';
import { EntraTokenVerifier } from './infrastructure/entra-token-verifier';
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
    GetAuthConfigHandler,
    IsActiveAdminHandler,
    AuthUserResolver,
    {
      provide: ACCESS_TOKEN_VERIFIER,
      inject: [ConfigService, TokenService],
      useFactory: (config: ConfigService, tokens: TokenService) =>
        authProviderOf({ AUTH_PROVIDER: config.get('AUTH_PROVIDER') }) ===
        'entra'
          ? new EntraTokenVerifier({
              tenantId: config.getOrThrow<string>('ENTRA_TENANT_ID').trim(),
              audience: config.getOrThrow<string>('ENTRA_API_AUDIENCE').trim(),
            })
          : new LocalTokenVerifier(tokens),
    },
  ],
  exports: [
    TokenService,
    IsActiveAdminHandler,
    ACCESS_TOKEN_VERIFIER,
    AuthUserResolver,
  ],
})
export class IdentityModule {}
