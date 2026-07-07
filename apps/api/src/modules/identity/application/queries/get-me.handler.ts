import { Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../../shared/domain/domain.error';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import type { UserDto } from '../../domain/user.dto';
import { mapUserToDto } from '../../infrastructure/user.mapper';

@Injectable()
export class GetMeHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(userId: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        orgUnit: true,
        roles: { include: { role: true } },
      },
    });

    if (!user) {
      throw new NotFoundError('User', userId);
    }

    return mapUserToDto(user);
  }
}
