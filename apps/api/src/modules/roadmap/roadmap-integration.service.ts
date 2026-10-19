import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { normalizeWriteBackSettings, WriteBackSettings } from './roadmap-write-back.settings';

export interface AzureDevOpsCredentials {
  organizationUrl: string;
  organization: string;
  pat: string;
}

type EncryptedPat = { iv: string; authTag: string; cipherText: string };
type StoredIntegration = {
  organizationUrl?: string;
  encryptedPat?: EncryptedPat;
  /** First version of write-back: true meant automatic mode. Kept for stored settings. */
  writeBackEnabled?: boolean;
  writeBack?: Partial<WriteBackSettings>;
  /** Shared secret that Azure DevOps service hooks send in the webhook header. */
  encryptedWebhookSecret?: EncryptedPat;
};

export const AZURE_WEBHOOK_SECRET_HEADER = 'x-roadmap-webhook-secret';

/** Azure DevOps answered with a non-success HTTP status. */
export class AzureDevOpsHttpError extends BadGatewayException {
  constructor(readonly httpStatus: number, details: string) {
    super(`Azure DevOps returned ${status}: ${details.slice(0, 500)}`);
  }
}

@Injectable()
export class RoadmapIntegrationService {
  private readonly settingKey = 'roadmap.integration.azure-devops';

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async getPublicSettings() {
    const stored = await this.readStoredSettings();
    const organizationUrl = stored?.organizationUrl ?? this.environmentUrl();
    const hasStoredPat = Boolean(stored?.encryptedPat);
    const hasEnvironmentPat = Boolean(this.config.get<string>('AZURE_DEVOPS_PAT')?.trim());
    return {
      provider: 'azure-devops',
      organizationUrl,
      configured: Boolean(organizationUrl && (hasStoredPat || hasEnvironmentPat)),
      patConfigured: hasStoredPat || hasEnvironmentPat,
      source: hasStoredPat ? 'settings' : hasEnvironmentPat ? 'environment' : 'unconfigured',
      encryptionKeyConfigured: Boolean(this.encryptionKey()),
      writeBackEnabled: this.writeBackOf(stored).mode !== 'off',
      writeBack: this.writeBackOf(stored),
      webhookConfigured: Boolean(stored?.encryptedWebhookSecret),
    };
  }

  async getCredentials(): Promise<AzureDevOpsCredentials> {
    const stored = await this.readStoredSettings();
    const organizationUrl = stored?.organizationUrl ?? this.environmentUrl();
    const pat = stored?.encryptedPat
      ? this.decryptPat(stored.encryptedPat)
      : this.config.get<string>('AZURE_DEVOPS_PAT')?.trim() ?? '';
    if (!organizationUrl || !pat) {
      throw new ServiceUnavailableException(
        'Configure Azure DevOps in Roadmap administration before importing project data',
      );
    }
    return { organizationUrl, organization: this.organizationFromUrl(organizationUrl), pat };
  }

  async saveSettings(input: { organizationUrl: string; pat?: string }) {
    const organizationUrl = this.normalizeOrganizationUrl(input.organizationUrl);
    const current = await this.currentPat();
    const pat = input.pat?.trim() || current;
    if (!pat) throw new BadRequestException('Enter an Azure DevOps PAT');
    const encryptedPat = this.encryptPat(pat);
    await this.writeStoredSettings({ ...(await this.readStoredSettings()), organizationUrl, encryptedPat });
    return this.getPublicSettings();
  }

  async getWriteBackSettings() {
    return this.writeBackOf(await this.readStoredSettings());
  }

  async saveWriteBackSettings(input: WriteBackSettings) {
    const stored = await this.readStoredSettings();
    const { writeBackEnabled: _legacy, ...rest } = stored ?? {};
    void _legacy;
    await this.writeStoredSettings({ ...rest, writeBack: normalizeWriteBackSettings(input) });
    return this.getPublicSettings();
  }

  /** Returns the webhook secret for administrators, creating it on first use. */
  async getWebhookSecret(rotate = false) {
    const stored = await this.readStoredSettings();
    if (stored?.encryptedWebhookSecret && !rotate) return { secret: this.decryptPat(stored.encryptedWebhookSecret) };
    const secret = randomBytes(24).toString('base64url');
    await this.writeStoredSettings({ ...stored, encryptedWebhookSecret: this.encryptPat(secret) });
    return { secret };
  }

  async verifyWebhookSecret(candidate: string | undefined) {
    const stored = await this.readStoredSettings();
    if (!candidate || !stored?.encryptedWebhookSecret) return false;
    const expected = createHash('sha256').update(this.decryptPat(stored.encryptedWebhookSecret)).digest();
    return timingSafeEqual(expected, createHash('sha256').update(candidate).digest());
  }

  async testConnection(input: { organizationUrl?: string; pat?: string }) {
    const current = await this.getCredentials().catch(() => null);
    const organizationUrl = input.organizationUrl?.trim()
      ? this.normalizeOrganizationUrl(input.organizationUrl)
      : current?.organizationUrl;
    const pat = input.pat?.trim() || current?.pat;
    if (!organizationUrl || !pat) {
      throw new BadRequestException('Enter an organization URL and PAT, or save them first');
    }
    const response = await fetch(
      `${organizationUrl}/_apis/projects?$top=1&api-version=7.1`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`:${pat}`).toString('base64')}`,
          Accept: 'application/json',
        },
      },
    ).catch(() => {
      throw new BadGatewayException('Could not reach Azure DevOps. Check the organization URL.');
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new BadGatewayException('Azure DevOps rejected the PAT or its permissions');
      }
      throw new BadGatewayException(`Azure DevOps connection failed (${response.status})`);
    }
    const result = (await response.json()) as { count?: number; value?: unknown[] };
    return { ok: true, projectCount: result.count ?? result.value?.length ?? 0 };
  }

  /** Calls the Azure DevOps REST API with the configured PAT and throws on non-success statuses. */
  async request(url: string, init?: RequestInit, credentials?: { pat: string }) {
    const { pat } = credentials ?? await this.getCredentials();
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Basic ${Buffer.from(`:${pat}`).toString('base64')}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...init?.headers,
        },
      });
    } catch {
      throw new BadGatewayException('Could not reach Azure DevOps');
    }
    if (!response.ok) throw new AzureDevOpsHttpError(response.status, await response.text());
    return response;
  }

  async requestJson<T>(url: string, init?: RequestInit, credentials?: { pat: string }): Promise<T> {
    return (await (await this.request(url, init, credentials)).json()) as T;
  }

  private async currentPat(): Promise<string> {
    const stored = await this.readStoredSettings();
    if (stored?.encryptedPat) return this.decryptPat(stored.encryptedPat);
    return this.config.get<string>('AZURE_DEVOPS_PAT')?.trim() ?? '';
  }

  private async readStoredSettings(): Promise<StoredIntegration | null> {
    const setting = await this.prisma.systemSetting.findUnique({ where: { key: this.settingKey } });
    return setting?.value && typeof setting.value === 'object' && !Array.isArray(setting.value)
      ? (setting.value as StoredIntegration)
      : null;
  }

  private writeBackOf(stored: StoredIntegration | null) {
    return normalizeWriteBackSettings(stored?.writeBack, stored?.writeBackEnabled);
  }

  private async writeStoredSettings(value: StoredIntegration) {
    await this.prisma.systemSetting.upsert({
      where: { key: this.settingKey },
      create: { key: this.settingKey, value: value as Prisma.InputJsonValue },
      update: { value: value as Prisma.InputJsonValue },
    });
  }

  private environmentUrl(): string {
    return this.config.get<string>('AZURE_DEVOPS_ORG_URL')?.trim().replace(/\/$/, '') ?? '';
  }

  private normalizeOrganizationUrl(value: string): string {
    let url: URL;
    try {
      url = new URL(value.trim());
    } catch {
      throw new BadRequestException('Enter a valid Azure DevOps organization URL');
    }
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || !(host === 'dev.azure.com' || host.endsWith('.visualstudio.com'))) {
      throw new BadRequestException('Use an HTTPS Azure DevOps Services organization URL');
    }
    const segments = url.pathname.split('/').filter(Boolean);
    if (!segments.length && host === 'dev.azure.com') {
      throw new BadRequestException('The URL must include an organization name');
    }
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  }

  private organizationFromUrl(value: string): string {
    const url = new URL(value);
    const legacyMatch = url.hostname.match(/^([^.]+)\.visualstudio\.com$/i);
    if (legacyMatch) return legacyMatch[1];
    const segments = url.pathname.split('/').filter(Boolean);
    if (!segments[0]) throw new ServiceUnavailableException('The Azure DevOps organization URL is invalid');
    return decodeURIComponent(segments[0]);
  }

  private encryptionKey(): Buffer | null {
    const secret =
      this.config.get<string>('ROADMAP_ENCRYPTION_KEY')?.trim() ||
      this.config.get<string>('JWT_SECRET')?.trim();
    return secret ? createHash('sha256').update(secret).digest() : null;
  }

  private encryptPat(pat: string): EncryptedPat {
    const key = this.encryptionKey();
    if (!key) {
      throw new ServiceUnavailableException(
        'Set ROADMAP_ENCRYPTION_KEY or JWT_SECRET in the API environment before saving integration credentials',
      );
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const cipherText = Buffer.concat([cipher.update(pat, 'utf8'), cipher.final()]);
    return {
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      cipherText: cipherText.toString('base64'),
    };
  }

  private decryptPat(encrypted: EncryptedPat): string {
    const key = this.encryptionKey();
    if (!key) {
      throw new ServiceUnavailableException('ROADMAP_ENCRYPTION_KEY or JWT_SECRET is not configured on the API');
    }
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(encrypted.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(encrypted.cipherText, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new ServiceUnavailableException(
        'Could not decrypt the Azure DevOps PAT. Check the encryption key used when it was saved.',
      );
    }
  }
}
