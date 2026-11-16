import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'node:http';
import type { AuthTokens } from '../src/modules/identity/domain/user.dto';
import { AppModule } from '../src/app.module';
import { TokenService } from '../src/modules/identity/infrastructure/token.service';
import { RoadmapService } from '../src/modules/roadmap/roadmap.service';
import { RoadmapAllocationService } from '../src/modules/roadmap/roadmap-allocation.service';
import { PrismaService } from '../src/shared/infrastructure/prisma/prisma.service';
import { DomainExceptionFilter } from '../src/shared/presentation/filters/domain-exception.filter';

const adminId = '00000000-0000-4000-8000-000000000002';
const employeeId = '00000000-0000-4000-8000-000000000005';
const plannerProject = '10000000-0000-4000-8000-000000000001';
const viewerProject = '10000000-0000-4000-8000-000000000002';
const privateProject = '10000000-0000-4000-8000-000000000003';
const plannerItem = '20000000-0000-4000-8000-000000000001';
const viewerItem = '20000000-0000-4000-8000-000000000002';
const roleId = '30000000-0000-4000-8000-000000000001';
const plannerAllocation = '40000000-0000-4000-8000-000000000001';
const viewerAllocation = '40000000-0000-4000-8000-000000000002';
const employeeEmail = 'employee@company.example';
const adminEmail = 'admin@tracker.local';
const password = 'temporary-admin-test-password';

describe('Roadmap authentication and project scope (e2e)', () => {
  let app: INestApplication<Server>;
  let tokens: TokenService;
  const employee = {
    id: employeeId,
    email: employeeEmail,
    fullName: 'Employee',
    isActive: true,
    roles: [],
  };
  const admin = {
    id: adminId,
    email: adminEmail,
    fullName: 'Administrator',
    isActive: true,
    roles: [{ role: { code: 'admin' } }],
  };
  const grants = new Map([
    [plannerProject, 'planner'],
    [viewerProject, 'viewer'],
  ]);
  const fixtureProjects = [plannerProject, viewerProject, privateProject];
  const allocationProjects = new Map([
    [plannerAllocation, plannerProject],
    [viewerAllocation, viewerProject],
  ]);
  const saveAllocation = jest.fn().mockResolvedValue({ saved: true });
  const getProjectPlan = jest.fn().mockResolvedValue({ workItems: [] });

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        user: {
          findUnique: ({ where }: { where: { id?: string; email?: string } }) =>
            Promise.resolve(
              [admin, employee].find(
                (user) => user.id === where.id || user.email === where.email,
              ) ?? null,
            ),
        },
        roadmapProjectAccess: {
          findUnique: ({
            where,
          }: {
            where: { projectId_email: { projectId: string; email: string } };
          }) => {
            const { projectId, email } = where.projectId_email;
            const role =
              email === employeeEmail ? grants.get(projectId) : undefined;
            return Promise.resolve(role ? { role } : null);
          },
        },
        roadmapProject: {
          findMany: ({
            where,
          }: {
            where?: { access?: { some: { email: string } } };
          }) =>
            Promise.resolve(
              fixtureProjects
                .filter(
                  (id) =>
                    !where ||
                    (where.access?.some.email === employeeEmail &&
                      grants.has(id)),
                )
                .map((id) => ({
                  id,
                  externalId: id,
                  name: id,
                  syncedAt: new Date(),
                })),
            ),
        },
        roadmapWorkItem: {
          findUnique: ({ where }: { where: { id: string } }) =>
            Promise.resolve({
              projectId:
                where.id === plannerItem ? plannerProject : viewerProject,
            }),
        },
        roadmapAllocation: {
          findMany: ({ where }: { where: { id: { in: string[] } } }) =>
            Promise.resolve(
              where.id.in.flatMap((id) => {
                const projectId = allocationProjects.get(id);
                return projectId ? [{ workItem: { projectId } }] : [];
              }),
            ),
        },
      })
      .overrideProvider(RoadmapService)
      .useValue({ getProjectPlan })
      .overrideProvider(RoadmapAllocationService)
      .useValue({ saveAllocation })
      .compile();
    app = fixture.createNestApplication<INestApplication<Server>>();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
    tokens = app.get(TokenService);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('requires a session regardless of the legacy identity header', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('X-User-Id', adminId)
      .expect(401);
  });

  it('serves the sign-in provider without a session', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/auth/config')
      .expect(200, { provider: 'local' });
  });

  it('issues a session only for the local administrator using the configured password', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post('/api/v1/auth/login')
      .send({ email: employeeEmail, password })
      .expect(401);
    await request(server)
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password: 'tracker' })
      .expect(401);
    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password })
      .expect(201);
    const body = login.body as AuthTokens;
    await request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(200)
      .expect((res) =>
        expect(res.body).toMatchObject({
          user: {
            email: adminEmail,
            roles: ['admin'],
          },
        }),
      );
    await request(server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: body.refreshToken })
      .expect(201);
  });

  it('allows the employee to read both granted projects and hides unassigned projects', async () => {
    const auth = `Bearer ${tokens.issueTokens(employeeId).accessToken}`;
    const server = app.getHttpServer();
    await request(server)
      .get('/api/v1/roadmap/projects')
      .set('Authorization', auth)
      .expect(200)
      .expect((res) => {
        const { data } = res.body as { data: { roadmapId: string }[] };
        expect(data.map(({ roadmapId }) => roadmapId)).toEqual([
          plannerProject,
          viewerProject,
        ]);
      });
    await request(server)
      .get(`/api/v1/roadmap/projects/${plannerProject}/plan`)
      .set('Authorization', auth)
      .expect(200)
      .expect((res) => expect(res.body).toMatchObject({ canEditPlan: true }));
    await request(server)
      .get(`/api/v1/roadmap/projects/${viewerProject}/plan`)
      .set('Authorization', auth)
      .expect(200)
      .expect((res) => expect(res.body).toMatchObject({ canEditPlan: false }));
    await request(server)
      .get(`/api/v1/roadmap/projects/${privateProject}/plan`)
      .set('Authorization', auth)
      .expect(403);
  });

  it('checks all selected allocations and restricts Azure operations and grant management', async () => {
    const auth = `Bearer ${tokens.issueTokens(employeeId).accessToken}`;
    const server = app.getHttpServer();
    await request(server)
      .put('/api/v1/roadmap/allocations/rebalance')
      .set('Authorization', auth)
      .send({ allocationIds: [plannerAllocation, viewerAllocation] })
      .expect(403);
    await request(server)
      .post(`/api/v1/roadmap/allocations/${viewerAllocation}/azure-push`)
      .set('Authorization', auth)
      .expect(403);
    await request(server)
      .get(`/api/v1/roadmap/projects/${viewerProject}/azure-push/preview`)
      .set('Authorization', auth)
      .expect(403);
    await request(server)
      .put(`/api/v1/roadmap/admin/projects/${viewerProject}/access`)
      .set('Authorization', auth)
      .send({ email: employeeEmail, role: 'planner' })
      .expect(403);
  });

  it('rejects access and refresh when the account is disabled', async () => {
    const session = tokens.issueTokens(employeeId);
    try {
      employee.isActive = false;
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(401);
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(401);
    } finally {
      employee.isActive = true;
    }
  });

  it('checks edit access against the work item project', async () => {
    const auth = `Bearer ${tokens.issueTokens(employeeId).accessToken}`;
    const payload = {
      roleId,
      personExternalId: 'person',
      personName: 'Person',
      quarterKey: '2026-Q4',
      estimatedHours: 8,
      periods: [],
    };
    const server = app.getHttpServer();
    await request(server)
      .put('/api/v1/roadmap/allocations')
      .set('Authorization', auth)
      .send({ ...payload, workItemId: viewerItem })
      .expect(403);
    await request(server)
      .put('/api/v1/roadmap/allocations')
      .set('Authorization', auth)
      .send({ ...payload, workItemId: plannerItem })
      .expect(200);
  });
});
