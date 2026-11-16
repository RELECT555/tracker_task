import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthClientConfig } from '@tracker/shared';
import { authProviderOf } from '../../../../shared/infrastructure/config/auth-config';

/** Tells the web app which sign-in provider the API accepts. */
@Injectable()
export class GetAuthConfigHandler {
  constructor(private readonly config: ConfigService) {}

  execute(): AuthClientConfig {
    if (this.provider() === 'local') return { provider: 'local' };
    const audience = this.value('ENTRA_API_AUDIENCE');
    return {
      provider: 'entra',
      tenantId: this.value('ENTRA_TENANT_ID'),
      clientId: this.value('ENTRA_CLIENT_ID'),
      scopes: [this.value('ENTRA_API_SCOPE') || `${audience}/access_as_user`],
    };
  }

  /** Password sign-in and our own refresh tokens exist only in local mode. */
  assertLocal(): void {
    if (this.provider() === 'local') return;
    throw new NotFoundException({
      error: {
        code: 'AUTH_PROVIDER_DISABLED',
        message: 'Вход по паролю отключён',
      },
    });
  }

  private provider() {
    return authProviderOf({ AUTH_PROVIDER: this.config.get('AUTH_PROVIDER') });
  }

  private value(key: string): string {
    return (this.config.get<string>(key) ?? '').trim();
  }
}
