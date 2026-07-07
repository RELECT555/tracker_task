import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { UnauthorizedError } from '../../../../shared/domain/domain.error';
import type { AuthTokens, UserDto } from '../../domain/user.dto';
import { mapUserToDto } from '../../infrastructure/user.mapper';
import { TokenService } from '../../infrastructure/token.service';

@Injectable()
export class LoginHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  async execute(input: {
    email: string;
    password: string;
  }): Promise<AuthTokens & { user: UserDto }> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: {
        orgUnit: true,
        roles: { include: { role: true } },
      },
    });

    if (!user?.passwordHash) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const issued = this.tokens.issueTokens(user.id);

    return {
      ...issued,
      user: mapUserToDto(user),
    };
  }
}
