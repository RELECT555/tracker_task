import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';

export interface AzureDevOpsCredentials {
  organizationUrl: string;
  organization: string;
  pat: string;
}

type EncryptedPat = { iv: string; authTag: string; cipherText: string };
type StoredIntegration = { organizationUrl?: string; encryptedPat?: EncryptedPat };

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
      source: stored ? 'settings' : hasEnvironmentPat ? 'environment' : 'unconfigured',
      encryptionKeyConfigured: Boolean(this.encryptionKey()),
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
    const value: StoredIntegration = { organizationUrl, encryptedPat };
    await this.prisma.systemSetting.upsert({
      where: { key: this.settingKey },
      create: { key: this.settingKey, value: value as Prisma.InputJsonValue },
      update: { value: value as Prisma.InputJsonValue },
    });
    return this.getPublicSettings();
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
        throw new BadGatewayException('Azure DevOps rejected the PAT or its read permissions');
      }
      throw new BadGatewayException(`Azure DevOps connection failed (${response.status})`);
    }
    const result = (await response.json()) as { count?: number; value?: unknown[] };
    return { ok: true, projectCount: result.count ?? result.value?.length ?? 0 };
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
