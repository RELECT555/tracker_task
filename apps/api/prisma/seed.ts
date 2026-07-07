import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEV_ADMIN_ID = '00000000-0000-4000-8000-000000000002';
const DEV_MANAGER_ID = '00000000-0000-4000-8000-000000000003';
const DEV_ORG_ID = '00000000-0000-4000-8000-000000000001';
const TYPE_VACATION_ID = '00000000-0000-4000-8000-000000000101';
const TYPE_PURCHASE_ID = '00000000-0000-4000-8000-000000000102';
const ROUTE_VACATION_ID = '00000000-0000-4000-8000-000000000201';
const ROUTE_PURCHASE_ID = '00000000-0000-4000-8000-000000000202';

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

  await prisma.user.upsert({
    where: { id: DEV_MANAGER_ID },
    update: {},
    create: {
      id: DEV_MANAGER_ID,
      email: 'manager@tracker.local',
      fullName: 'Руководитель отдела',
      orgUnitId: DEV_ORG_ID,
      roles: {
        create: [{ roleId: managerRole.id }, { roleId: employeeRole.id }],
      },
    },
  });

  await prisma.user.upsert({
    where: { id: DEV_ADMIN_ID },
    update: { managerId: DEV_MANAGER_ID },
    create: {
      id: DEV_ADMIN_ID,
      email: 'admin@tracker.local',
      fullName: 'Администратор',
      orgUnitId: DEV_ORG_ID,
      managerId: DEV_MANAGER_ID,
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
    where: { id_version: { id: ROUTE_VACATION_ID, version: 1 } },
    update: { isPublished: true },
    create: {
      id: ROUTE_VACATION_ID,
      name: 'Отпуск — стандартный',
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
            name: 'Согласование HR',
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
    where: { id_version: { id: ROUTE_PURCHASE_ID, version: 1 } },
    update: { isPublished: true },
    create: {
      id: ROUTE_PURCHASE_ID,
      name: 'Закупка — стандартный',
      version: 1,
      isPublished: true,
      steps: {
        create: [
          {
            stepOrder: 0,
            name: 'Согласование руководителя',
            assigneeType: 'manager_chain',
            assigneeRef: '1',
            actions: ['approve', 'reject', 'escalate'],
            slaHours: 24,
          },
          {
            stepOrder: 1,
            name: 'Согласование директора',
            assigneeType: 'manager_chain',
            assigneeRef: '2',
            actions: ['approve', 'reject'],
            slaHours: 72,
          },
        ],
      },
    },
  });

  await prisma.requestType.upsert({
    where: { id: TYPE_VACATION_ID },
    update: { defaultRouteTemplateId: ROUTE_VACATION_ID },
    create: {
      id: TYPE_VACATION_ID,
      code: 'vacation',
      name: 'Отпуск',
      description: 'Заявление на ежегодный оплачиваемый отпуск',
      defaultRouteTemplateId: ROUTE_VACATION_ID,
      fieldSchema: [
        { key: 'dateFrom', label: 'Дата начала', type: 'date', required: true },
        { key: 'dateTo', label: 'Дата окончания', type: 'date', required: true },
        { key: 'days', label: 'Кол-во дней', type: 'number', required: true },
        { key: 'reason', label: 'Причина', type: 'text', required: false },
      ],
    },
  });

  await prisma.requestType.upsert({
    where: { id: TYPE_PURCHASE_ID },
    update: { defaultRouteTemplateId: ROUTE_PURCHASE_ID },
    create: {
      id: TYPE_PURCHASE_ID,
      code: 'purchase',
      name: 'Закупка',
      description: 'Заявка на закупку оборудования или услуг',
      defaultRouteTemplateId: ROUTE_PURCHASE_ID,
      fieldSchema: [
        { key: 'amount', label: 'Сумма', type: 'number', required: true },
        { key: 'description', label: 'Описание', type: 'text', required: true },
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
