import { PrismaClient } from '@prisma/client';

if (process.env.NODE_ENV === 'production') {
  throw new Error('Roadmap mock data can only be seeded outside production.');
}

const prisma = new PrismaClient();

const people = [
  { externalId: 'mock:anna-smirnova', name: 'Анна Смирнова', email: 'anna.smirnova@example.test' },
  { externalId: 'mock:ivan-petrov', name: 'Иван Петров', email: 'ivan.petrov@example.test' },
  { externalId: 'mock:maria-volkova', name: 'Мария Волкова', email: 'maria.volkova@example.test' },
  { externalId: 'mock:dmitry-sokolov', name: 'Дмитрий Соколов', email: 'dmitry.sokolov@example.test' },
  { externalId: 'mock:elena-orlova', name: 'Елена Орлова', email: 'elena.orlova@example.test' },
];

const roles = [
  { name: 'Backend (демо)', color: '#6366f1', people: ['mock:ivan-petrov', 'mock:dmitry-sokolov'] },
  { name: 'Frontend (демо)', color: '#0ea5e9', people: ['mock:anna-smirnova', 'mock:ivan-petrov'] },
  { name: 'QA (демо)', color: '#10b981', people: ['mock:maria-volkova', 'mock:elena-orlova'] },
  { name: 'Аналитика (демо)', color: '#f59e0b', people: ['mock:anna-smirnova', 'mock:elena-orlova'] },
];

async function main() {
  const requestedProject = process.argv[2]?.trim();
  const project = await prisma.roadmapProject.findFirst({
    where: requestedProject
      ? { OR: [{ externalId: requestedProject }, { name: requestedProject }] }
      : { name: 'OKR' },
    orderBy: [{ syncedAt: 'desc' }, { createdAt: 'desc' }],
  }) ?? (!requestedProject ? await prisma.roadmapProject.findFirst({ orderBy: [{ syncedAt: 'desc' }, { createdAt: 'desc' }] }) : null);
  for (const person of people) {
    await prisma.roadmapPerson.upsert({
      where: { externalId: person.externalId },
      create: { ...person, isMock: true, isActive: true, syncedAt: new Date() },
      update: { ...person, isMock: true, isActive: true, syncedAt: new Date() },
    });
  }

  const peopleByExternalId = new Map(
    (await prisma.roadmapPerson.findMany({
      where: { externalId: { in: people.map((person) => person.externalId) } },
      select: { id: true, externalId: true },
    })).map((person) => [person.externalId, person.id]),
  );

  if (!project) {
    console.log(`Seeded ${people.length} demo users. Import a project before seeding project roles.`);
    return;
  }

  for (const role of roles) {
    const savedRole = await prisma.roadmapRole.findFirst({ where: { projectId: project.id, name: role.name } })
      ?? await prisma.roadmapRole.findFirst({ where: { name: role.name, isMock: true, projectId: null } });
    const projectRole = savedRole
      ? await prisma.roadmapRole.update({ where: { id: savedRole.id }, data: { projectId: project.id, color: role.color, isMock: true } })
      : await prisma.roadmapRole.create({ data: { projectId: project.id, name: role.name, color: role.color, isMock: true } });
    await prisma.roadmapRoleMember.deleteMany({ where: { roleId: projectRole.id } });
    await prisma.roadmapRoleMember.createMany({
      data: role.people.map((externalId) => ({ roleId: projectRole.id, personId: peopleByExternalId.get(externalId)! })),
      skipDuplicates: true,
    });
  }

  console.log(`Seeded ${people.length} demo users and ${roles.length} demo roles with role memberships for ${project.name}.`);
}

main().finally(() => prisma.$disconnect());
