import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEV_ADMIN_ID = '00000000-0000-4000-8000-000000000002';
const DEV_ORG_ID = '00000000-0000-4000-8000-000000000001';
const TYPE_VACATION_ID = '00000000-0000-4000-8000-000000000101';
const TYPE_PURCHASE_ID = '00000000-0000-4000-8000-000000000102';

async function main() {
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

  await prisma.user.upsert({
    where: { id: DEV_ADMIN_ID },
    update: {},
    create: {
      id: DEV_ADMIN_ID,
      email: 'admin@tracker.local',
      fullName: 'Администратор',
      orgUnitId: DEV_ORG_ID,
      roles: {
        create: [{ roleId: adminRole.id }, { roleId: employeeRole.id }],
      },
    },
  });

  await prisma.requestType.upsert({
    where: { id: TYPE_VACATION_ID },
    update: {},
    create: {
      id: TYPE_VACATION_ID,
      code: 'vacation',
      name: 'Отпуск',
      description: 'Заявление на ежегодный оплачиваемый отпуск',
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
    update: {},
    create: {
      id: TYPE_PURCHASE_ID,
      code: 'purchase',
      name: 'Закупка',
      description: 'Заявка на закупку оборудования или услуг',
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
