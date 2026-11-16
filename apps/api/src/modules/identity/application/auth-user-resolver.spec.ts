import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { AuthUserResolver } from './auth-user-resolver';

const userId = '00000000-0000-4000-8000-000000000002';
const oid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const tenantId = '11111111-2222-4333-8444-555555555555';

const row = (overrides: Record<string, unknown> = {}) => ({
  id: userId,
  email: 'ivan@corp.com',
  isActive: true,
  externalId: null as string | null,
  roles: [{ role: { code: 'admin' } }],
  ...overrides,
});

function setup() {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };
  const resolver = new AuthUserResolver(prisma as unknown as PrismaService);
  return { prisma: prisma.user, resolver };
}

const entra = (email: string | null = 'ivan@corp.com') => ({
  kind: 'entra' as const,
  oid,
  tenantId,
  email,
});

describe('AuthUserResolver', () => {
  it('resolves a local identity by user id', async () => {
    const { prisma, resolver } = setup();
    prisma.findUnique.mockResolvedValue(row());
    await expect(resolver.resolve({ kind: 'local', userId })).resolves.toEqual({
      id: userId,
      email: 'ivan@corp.com',
      isAdmin: true,
    });
    expect(prisma.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: userId } }),
    );
  });

  it('rejects an inactive or missing local user', async () => {
    const { prisma, resolver } = setup();
    prisma.findUnique.mockResolvedValueOnce(row({ isActive: false }));
    await expect(
      resolver.resolve({ kind: 'local', userId }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    prisma.findUnique.mockResolvedValueOnce(null);
    await expect(
      resolver.resolve({ kind: 'local', userId }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('finds an Entra user by the linked object id', async () => {
    const { prisma, resolver } = setup();
    prisma.findUnique.mockResolvedValue(row({ externalId: oid, roles: [] }));
    await expect(resolver.resolve(entra())).resolves.toEqual({
      id: userId,
      email: 'ivan@corp.com',
      isAdmin: false,
    });
    expect(prisma.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { externalId: oid } }),
    );
    expect(prisma.update).not.toHaveBeenCalled();
  });

  it('links an unlinked user found by email on first sign-in', async () => {
    const { prisma, resolver } = setup();
    prisma.findUnique.mockResolvedValue(null);
    prisma.findFirst.mockResolvedValue(row());
    prisma.update.mockResolvedValue(row({ externalId: oid }));
    await expect(resolver.resolve(entra())).resolves.toMatchObject({
      id: userId,
    });
    expect(prisma.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { equals: 'ivan@corp.com', mode: 'insensitive' } },
      }),
    );
    expect(prisma.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: userId },
        data: { externalId: oid },
      }),
    );
  });

  it('refuses an email match that is linked to another Entra account', async () => {
    const { prisma, resolver } = setup();
    prisma.findUnique.mockResolvedValue(null);
    prisma.findFirst.mockResolvedValue(row({ externalId: 'another-oid' }));
    await expect(resolver.resolve(entra())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.update).not.toHaveBeenCalled();
  });

  it.each([null, 'stranger@corp.com'])(
    'refuses an Entra user who is not in Roadmap (email %s)',
    async (email) => {
      const { prisma, resolver } = setup();
      prisma.findUnique.mockResolvedValue(null);
      prisma.findFirst.mockResolvedValue(null);
      const result = resolver.resolve(entra(email));
      await expect(result).rejects.toBeInstanceOf(ForbiddenException);
      await expect(result).rejects.toMatchObject({
        response: { error: { code: 'USER_NOT_PROVISIONED' } },
      });
    },
  );

  it('rejects an inactive Entra user', async () => {
    const { prisma, resolver } = setup();
    prisma.findUnique.mockResolvedValue(
      row({ externalId: oid, isActive: false }),
    );
    await expect(resolver.resolve(entra())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
