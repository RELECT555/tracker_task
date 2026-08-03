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

const TYPE_GENERIC_ID = '00000000-0000-4000-8000-000000000101';
const TYPE_SIMPLE_ID = '00000000-0000-4000-8000-000000000102';
const TYPE_PERSONAL_ID = '00000000-0000-4000-8000-000000000103';
const ROUTE_STANDARD_ID = '00000000-0000-4000-8000-000000000201';
const ROUTE_SHORT_ID = '00000000-0000-4000-8000-000000000202';

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

  await prisma.routeTemplate.upsert({
    where: { id_version: { id: ROUTE_STANDARD_ID, version: 1 } },
    update: { isPublished: true, name: 'Стандартный маршрут (2 шага)' },
    create: {
      id: ROUTE_STANDARD_ID,
      name: 'Стандартный маршрут (2 шага)',
      version: 1,
      isPublished: true,
      steps: {
        create: [
          {
            stepOrder: 0,
            name: 'Согласование руководителя',
            assigneeType: 'manager_chain',
            assigneeRef: '1',
            actions: ['approve', 'reject', 'request_info'],
            slaHours: 24,
          },
          {
            stepOrder: 1,
            name: 'Финальное согласование',
            assigneeType: 'role',
            assigneeRef: 'admin',
            actions: ['approve', 'reject'],
            slaHours: 48,
          },
        ],
      },
    },
  });

  await prisma.routeTemplate.upsert({
    where: { id_version: { id: ROUTE_SHORT_ID, version: 1 } },
    update: { isPublished: true, name: 'Краткий маршрут (1 шаг)' },
    create: {
      id: ROUTE_SHORT_ID,
      name: 'Краткий маршрут (1 шаг)',
      version: 1,
      isPublished: true,
      steps: {
        create: [
          {
            stepOrder: 0,
            name: 'Согласование руководителя',
            assigneeType: 'manager_chain',
            assigneeRef: '1',
            actions: ['approve', 'reject', 'escalate', 'request_info'],
            slaHours: 24,
          },
        ],
      },
    },
  });

  await prisma.requestType.upsert({
    where: { id: TYPE_GENERIC_ID },
    update: {
      code: 'generic_approval',
      name: 'Универсальное согласование',
      description: 'Настраиваемый тип с произвольными полями формы',
      defaultRouteTemplateId: ROUTE_STANDARD_ID,
      fieldSchema: [
        { key: 'subject', label: 'Тема', type: 'text', required: true },
        { key: 'details', label: 'Подробности', type: 'textarea', required: false },
        {
          key: 'priority_level',
          label: 'Приоритет',
          type: 'select',
          required: false,
          options: [
            { value: 'low', label: 'Низкий' },
            { value: 'normal', label: 'Обычный' },
            { value: 'high', label: 'Высокий' },
          ],
        },
        { key: 'due_date', label: 'Желаемая дата', type: 'date', required: false },
        { key: 'amount', label: 'Сумма / бюджет', type: 'number', required: false },
        { key: 'urgent', label: 'Срочно', type: 'boolean', required: false },
      ],
    },
    create: {
      id: TYPE_GENERIC_ID,
      code: 'generic_approval',
      name: 'Универсальное согласование',
      description: 'Настраиваемый тип с произвольными полями формы',
      defaultRouteTemplateId: ROUTE_STANDARD_ID,
      fieldSchema: [
        { key: 'subject', label: 'Тема', type: 'text', required: true },
        { key: 'details', label: 'Подробности', type: 'textarea', required: false },
        {
          key: 'priority_level',
          label: 'Приоритет',
          type: 'select',
          required: false,
          options: [
            { value: 'low', label: 'Низкий' },
            { value: 'normal', label: 'Обычный' },
            { value: 'high', label: 'Высокий' },
          ],
        },
        { key: 'due_date', label: 'Желаемая дата', type: 'date', required: false },
        { key: 'amount', label: 'Сумма / бюджет', type: 'number', required: false },
        { key: 'urgent', label: 'Срочно', type: 'boolean', required: false },
      ],
    },
  });

  await prisma.requestType.upsert({
    where: { id: TYPE_SIMPLE_ID },
    update: {
      code: 'simple_note',
      name: 'Краткая заявка',
      description: 'Минимальный тип — только текст запроса',
      defaultRouteTemplateId: ROUTE_SHORT_ID,
      fieldSchema: [
        { key: 'body', label: 'Текст запроса', type: 'textarea', required: true },
      ],
    },
    create: {
      id: TYPE_SIMPLE_ID,
      code: 'simple_note',
      name: 'Краткая заявка',
      description: 'Минимальный тип — только текст запроса',
      defaultRouteTemplateId: ROUTE_SHORT_ID,
      fieldSchema: [
        { key: 'body', label: 'Текст запроса', type: 'textarea', required: true },
      ],
    },
  });

  // Personal route builder (UC-06) is not shipped yet — keep a default template
  // so submit works; allowsPersonalRoute stays true for when the builder lands.
  await prisma.requestType.upsert({
    where: { id: TYPE_PERSONAL_ID },
    update: {
      code: 'personal_request',
      name: 'Личный запрос',
      description:
        'Запрос с персональным маршрутом (пока используется краткий маршрут по умолчанию)',
      defaultRouteTemplateId: ROUTE_SHORT_ID,
      allowsPersonalRoute: true,
      maxPersonalRouteSteps: 3,
      fieldSchema: [
        { key: 'subject', label: 'Тема', type: 'text', required: true },
        { key: 'details', label: 'Подробности', type: 'textarea', required: false },
        { key: 'addressee', label: 'Кому адресовано', type: 'user_ref', required: true },
      ],
    },
    create: {
      id: TYPE_PERSONAL_ID,
      code: 'personal_request',
      name: 'Личный запрос',
      description:
        'Запрос с персональным маршрутом (пока используется краткий маршрут по умолчанию)',
      defaultRouteTemplateId: ROUTE_SHORT_ID,
      allowsPersonalRoute: true,
      maxPersonalRouteSteps: 3,
      fieldSchema: [
        { key: 'subject', label: 'Тема', type: 'text', required: true },
        { key: 'details', label: 'Подробности', type: 'textarea', required: false },
        { key: 'addressee', label: 'Кому адресовано', type: 'user_ref', required: true },
      ],
    },
  });

  await prisma.systemSetting.upsert({
    where: { key: 'sla.auto_escalation_enabled' },
    update: {},
    create: {
      key: 'sla.auto_escalation_enabled',
      value: true,
    },
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
