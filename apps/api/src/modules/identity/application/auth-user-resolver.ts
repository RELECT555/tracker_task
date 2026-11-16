import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  isDatabaseUnavailable,
  PrismaService,
} from '../../../shared/infrastructure/prisma/prisma.service';
import type { AuthenticatedUser } from '../../../shared/presentation/decorators/current-user.decorator';
import type { VerifiedIdentity } from '../infrastructure/access-token-verifier';

const select = {
  id: true,
  email: true,
  isActive: true,
  externalId: true,
  roles: { select: { role: { select: { code: true } } } },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof select }>;

/** Maps a verified token identity to an active Roadmap user. */
@Injectable()
export class AuthUserResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(identity: VerifiedIdentity): Promise<AuthenticatedUser> {
    const user = await this.guard(
      identity.kind === 'local'
        ? this.prisma.user.findUnique({
            where: { id: identity.userId },
            select,
          })
        : this.findEntraUser(identity.oid, identity.email),
    );
    if (!user?.isActive) {
      throw new UnauthorizedException({
        error: { code: 'UNAUTHORIZED', message: 'Account is inactive' },
      });
    }
    return {
      id: user.id,
      email: user.email,
      isAdmin: user.roles.some(({ role }) => role.code === 'admin'),
    };
  }

  private async findEntraUser(
    oid: string,
    email: string | null,
  ): Promise<UserRow> {
    const linked = await this.prisma.user.findUnique({
      where: { externalId: oid },
      select,
    });
    if (linked) return linked;

    const byEmail = email
      ? await this.prisma.user.findFirst({
          where: { email: { equals: email, mode: 'insensitive' } },
          select,
        })
      : null;
    if (!byEmail || byEmail.externalId !== null) {
      throw new ForbiddenException({
        error: {
          code: 'USER_NOT_PROVISIONED',
          message:
            'Учётная запись не добавлена в Roadmap. Обратитесь к администратору.',
        },
      });
    }
    return this.prisma.user.update({
      where: { id: byEmail.id },
      data: { externalId: oid },
      select,
    });
  }

  private guard<T>(query: Promise<T>): Promise<T> {
    return query.catch((error: unknown) => {
      if (!isDatabaseUnavailable(error)) throw error;
      throw new ServiceUnavailableException({
        error: { code: 'DB_UNAVAILABLE', message: 'Database is not available' },
      });
    });
  }
}
