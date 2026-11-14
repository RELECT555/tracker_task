import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { UnauthorizedError } from '../../../../shared/domain/domain.error';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import type { UserDto } from '../../domain/user.dto';
import { mapUserToDto } from '../../infrastructure/user.mapper';

@Injectable()
export class GetMeHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(userId: string): Promise<UserDto> {
    return this.findActive({ id: userId });
  }

  async byEmail(email: string): Promise<UserDto> {
    return this.findActive({ email });
  }

  private async findActive(
    where: Prisma.UserWhereUniqueInput,
  ): Promise<UserDto> {
    if (!this.prisma.isConnected)
      throw new ServiceUnavailableException('Database is not available');
    const user = await this.prisma.user.findUnique({
      where,
      include: {
        orgUnit: true,
        manager: { select: { id: true, fullName: true } },
        roles: { include: { role: true } },
      },
    });

    if (!user?.isActive) {
      throw new UnauthorizedError('Учётная запись недоступна');
    }

    return mapUserToDto(user);
  }
}
