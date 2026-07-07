import type { OrgUnit, Role, User, UserRole } from '@prisma/client';
import type { UserDto } from '../domain/user.dto';

type UserWithRelations = User & {
  orgUnit: OrgUnit | null;
  roles: (UserRole & { role: Role })[];
};

export function mapUserToDto(user: UserWithRelations): UserDto {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    roles: user.roles.map((entry) => entry.role.code),
    orgUnit: user.orgUnit
      ? { id: user.orgUnit.id, name: user.orgUnit.name }
      : null,
  };
}
