import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const DEV_PASSWORD = 'tracker';

const DEV_ADMIN_ID = '00000000-0000-4000-8000-000000000002';
const DEV_MANAGER_ID = '00000000-0000-4000-8000-000000000003';
const DEV_DIRECTOR_ID = '00000000-0000-4000-8000-000000000004';
const DEV_ORG_ID = '00000000-0000-4000-8000-000000000001';
const TYPE_GENERIC_ID = '00000000-0000-4000-8000-000000000101';
const TYPE_SIMPLE_ID = '00000000-0000-4000-8000-000000000102';
const TYPE_PERSONAL_ID = '00000000-0000-4000-8000-000000000103';
const ROUTE_STANDARD_ID = '00000000-0000-4000-8000-000000000201';
const ROUTE_SHORT_ID = '00000000-0000-4000-8000-000000000202';

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
    update: {},
    create: {
      id: DEV_ORG_ID,
      name: 'Компания',
      path: '/root/',
    },
  });

  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { code: 'admin' },
  });
  const employeeRole = await prisma.role.findUniqueOrThrow({
    where: { code: 'employee' },
  });
  const managerRole = await prisma.role.findUniqueOrThrow({
    where: { code: 'manager' },
  });
  const directorRole = await prisma.role.findUniqueOrThrow({
    where: { code: 'director' },
  });

  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);

  await prisma.user.upsert({
    where: { id: DEV_DIRECTOR_ID },
    update: { passwordHash },
    create: {
      id: DEV_DIRECTOR_ID,
      email: 'director@tracker.local',
      fullName: 'Директор',
      orgUnitId: DEV_ORG_ID,
      passwordHash,
      roles: {
        create: [{ roleId: directorRole.id }, { roleId: employeeRole.id }],
      },
    },
  });

  await prisma.user.upsert({
    where: { id: DEV_MANAGER_ID },
    update: { managerId: DEV_DIRECTOR_ID, passwordHash },
    create: {
      id: DEV_MANAGER_ID,
      email: 'manager@tracker.local',
      fullName: 'Руководитель отдела',
      orgUnitId: DEV_ORG_ID,
      managerId: DEV_DIRECTOR_ID,
      passwordHash,
      roles: {
        create: [{ roleId: managerRole.id }, { roleId: employeeRole.id }],
      },
    },
  });

  await prisma.user.upsert({
    where: { id: DEV_ADMIN_ID },
    update: { managerId: DEV_MANAGER_ID, passwordHash },
    create: {
      id: DEV_ADMIN_ID,
      email: 'admin@tracker.local',
      fullName: 'Администратор',
      orgUnitId: DEV_ORG_ID,
      managerId: DEV_MANAGER_ID,
      passwordHash,
      roles: {
        create: [{ roleId: adminRole.id }, { roleId: employeeRole.id }],
      },
    },
  });

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

  await prisma.requestType.upsert({
    where: { id: TYPE_PERSONAL_ID },
    update: {
      code: 'personal_request',
      name: 'Личный запрос',
      description: 'Произвольный запрос — автор сам выбирает согласующих',
      defaultRouteTemplateId: null,
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
      description: 'Произвольный запрос — автор сам выбирает согласующих',
      defaultRouteTemplateId: null,
      allowsPersonalRoute: true,
      maxPersonalRouteSteps: 3,
      fieldSchema: [
        { key: 'subject', label: 'Тема', type: 'text', required: true },
        { key: 'details', label: 'Подробности', type: 'textarea', required: false },
        { key: 'addressee', label: 'Кому адресовано', type: 'user_ref', required: true },
      ],
    },
  });
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
