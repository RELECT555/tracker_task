import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const DEV_PASSWORD = 'tracker';

/** Stable IDs — referenced by docs, DEV_USER_ID, and tests. */
const DEV_ORG_ID = '00000000-0000-4000-8000-000000000001';
const DEV_ADMIN_ID = '00000000-0000-4000-8000-000000000002';
const DEV_MANAGER_ID = '00000000-0000-4000-8000-000000000003';
const DEV_DIRECTOR_ID = '00000000-0000-4000-8000-000000000004';
const DEV_EMPLOYEE_ID = '00000000-0000-4000-8000-000000000005';
const DEV_EMPLOYEE2_ID = '00000000-0000-4000-8000-000000000006';
const DEV_OBSERVER_ID = '00000000-0000-4000-8000-000000000007';

/**
 * Dev personas for role / hierarchy testing.
 *
 * Hierarchy (manager_chain):
 *   Director
 *     └── Manager (head of org)
 *           ├── Admin
 *           ├── Employee
 *           ├── Employee 2
 *           └── Observer
 */
type DevUserSeed = {
  id: string;
  email: string;
  fullName: string;
  managerId: string | null;
  roleCodes: string[];
};

const DEV_USERS: DevUserSeed[] = [
  {
    id: DEV_DIRECTOR_ID,
    email: 'director@tracker.local',
    fullName: 'Алексей Воронов',
    managerId: null,
    roleCodes: ['director', 'employee'],
  },
  {
    id: DEV_MANAGER_ID,
    email: 'manager@tracker.local',
    fullName: 'Мария Соколова',
    managerId: DEV_DIRECTOR_ID,
    roleCodes: ['manager', 'employee'],
  },
  {
    id: DEV_ADMIN_ID,
    email: 'admin@tracker.local',
    fullName: 'Дмитрий Орлов',
    managerId: DEV_MANAGER_ID,
    roleCodes: ['admin', 'employee'],
  },
  {
    id: DEV_EMPLOYEE_ID,
    email: 'employee@tracker.local',
    fullName: 'Анна Кузнецова',
    managerId: DEV_MANAGER_ID,
    roleCodes: ['employee'],
  },
  {
    id: DEV_EMPLOYEE2_ID,
    email: 'employee2@tracker.local',
    fullName: 'Игорь Петров',
    managerId: DEV_MANAGER_ID,
    roleCodes: ['employee'],
  },
  {
    id: DEV_OBSERVER_ID,
    email: 'observer@tracker.local',
    fullName: 'Елена Морозова',
    managerId: DEV_MANAGER_ID,
    roleCodes: ['observer'],
  },
];

async function upsertDevUser(
  user: DevUserSeed,
  passwordHash: string,
  roleIdByCode: Map<string, string>,
) {
  await prisma.user.upsert({
    where: { id: user.id },
    update: {
      email: user.email,
      fullName: user.fullName,
      orgUnitId: DEV_ORG_ID,
      managerId: user.managerId,
      passwordHash,
      isActive: true,
    },
    create: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      orgUnitId: DEV_ORG_ID,
      managerId: user.managerId,
      passwordHash,
      isActive: true,
    },
  });

  for (const code of user.roleCodes) {
    const roleId = roleIdByCode.get(code);
    if (!roleId) {
      throw new Error(`Unknown role code in seed: ${code}`);
    }
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId } },
      update: {},
      create: { userId: user.id, roleId },
    });
  }
}

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED !== 'true') {
    throw new Error(
      'Seed is disabled in production. Set ALLOW_SEED=true only for intentional bootstrap.',
    );
  }

  const roles = [
    { code: 'employee', name: 'Сотрудник' },
    { code: 'manager', name: 'Руководитель' },
    { code: 'director', name: 'Директор' },
    { code: 'admin', name: 'Администратор' },
    { code: 'observer', name: 'Наблюдатель' },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: { name: role.name },
      create: role,
    });
  }

  await prisma.orgUnit.upsert({
    where: { id: DEV_ORG_ID },
    update: { name: 'Компания' },
    create: {
      id: DEV_ORG_ID,
      name: 'Компания',
      path: '/root/',
    },
  });

  const roleRows = await prisma.role.findMany({
    where: { code: { in: roles.map((r) => r.code) } },
  });
  const roleIdByCode = new Map(roleRows.map((r) => [r.code, r.id]));

  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);

  // Director first (no manager), then manager, then subordinates.
  for (const user of DEV_USERS) {
    await upsertDevUser(user, passwordHash, roleIdByCode);
  }

  await prisma.orgUnit.update({
    where: { id: DEV_ORG_ID },
    data: { headId: DEV_MANAGER_ID },
  });

  console.log('\nDev accounts (password: tracker)');
  console.log('─────────────────────────────────────────────────────────────');
  for (const user of DEV_USERS) {
    console.log(
      `  ${user.email.padEnd(28)} ${user.fullName.padEnd(18)} [${user.roleCodes.join(', ')}]`,
    );
  }
  console.log('─────────────────────────────────────────────────────────────\n');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
