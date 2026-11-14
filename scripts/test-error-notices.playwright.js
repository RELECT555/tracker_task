/* Run with a local web server:
 * npx --package @playwright/cli playwright-cli -s=errors open http://localhost:3000 --browser chrome
 * npx --package @playwright/cli playwright-cli -s=errors run-code --filename scripts/test-error-notices.playwright.js
 * All API responses are isolated fixtures; no server data is changed.
 */
async (page) => {
  const origin = 'http://localhost:3000';
  const rolesPath = '/roadmap/admin/roles';
  const usersPath = '/roadmap/admin/users';
  const projectsPath = '/roadmap/projects';
  const catalogPath = '/roadmap/admin/role-catalog';
  const settingsPath = '/roadmap/settings/azure-devops';
  const overviewPath = `${settingsPath}/write-back/overview`;
  const mappingPath = `${settingsPath}/write-back/v2`;
  const fieldsPath = `${settingsPath}/fields`;
  const rolePaths = [rolesPath, projectsPath, catalogPath];
  const counts = new Map();
  const writes = [];
  const runtimeErrors = [];
  const report = [];
  let failures = new Set(rolePaths);
  let delay = 0;
  const project = { id: 'fixture-project', roadmapId: 'fixture-project', name: 'Тестовый проект', imported: true, planSynced: true };
  const role = { id: 'fixture-role', name: 'Разработка', color: '#6366f1', projectId: project.roadmapId, projectName: project.name, members: [] };
  const writeBack = { mode: 'off', workItemType: 'Task', titleTemplate: '{title}', tagsTemplate: '', fields: {}, remainingWorkPolicy: 'recalculate', projectIds: null };
  const fixtures = {
    '/auth/me': { user: { id: 'notice-user', email: 'notices@example.test', fullName: 'Проверка ошибок', roles: ['admin'], orgUnit: null, manager: null } },
    [projectsPath]: { data: [project] },
    [rolesPath]: [role],
    [usersPath]: [],
    '/roadmap/admin/users/sync': { synced: 3, ignored: 0 },
    [catalogPath]: [],
    '/roadmap/connection': { provider: 'azure-devops', configured: true, organizationUrl: '' },
    '/roadmap/people': { data: [] },
    '/roadmap/admin/projects': { data: [project] },
    '/roadmap/admin/projects/fixture-project/access': [],
    '/roadmap/projects/fixture-project/plan': { id: project.id, externalId: project.id, name: project.name, roles: [role], workItems: [], azure: { writeBackEnabled: false } },
    [settingsPath]: { provider: 'azure-devops', configured: true, organizationUrl: 'https://dev.azure.com/fixture', patConfigured: true, source: 'settings', encryptionKeyConfigured: true, writeBack, writeBackEnabled: false, webhookConfigured: false },
    [overviewPath]: { settings: writeBack, projects: [{ id: project.id, externalId: project.id, name: project.name, counts: {}, total: 0 }], errors: [] },
    [mappingPath]: { version: 2, mode: 'off', projectIds: null, workItemType: 'Task', titleTemplate: '{title}', tagsTemplate: '', writeRules: [], readRules: [], roleFields: [], fact: { field: 'CompletedWork', scope: 'allChildTasks' }, writeFeatureAggregates: false, conflictPolicy: 'overwrite', removalPolicy: { action: 'keep' }, pushPermission: 'planners' },
    [fieldsPath]: [],
  };
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const until = async (predicate, message) => {
    for (let attempt = 0; attempt < 200; attempt++) {
      if (await predicate()) return;
      await page.waitForTimeout(50);
    }
    throw new Error(message);
  };
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await page.context().addInitScript(() => {
    localStorage.setItem('tracker.accessToken', 'isolated-notice-fixture');
    localStorage.setItem('tracker.sessionId', 'isolated-notice-session');
    localStorage.setItem('theme', 'dark');
  });
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    counts.set(path, (counts.get(path) ?? 0) + 1);
    if (route.request().method() !== 'GET') writes.push(path);
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    if (failures.has(path)) {
      await route.fulfill({ status: 500, contentType: 'text/plain', body: '' });
    } else {
      assert(path in fixtures, `Missing isolated fixture: ${path}`);
      if (path === mappingPath && route.request().method() === 'PUT') fixtures[path] = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtures[path]) });
    }
  });
  const alerts = () => page.locator('main [role="alert"]');
  const waitForError = async () => {
    await page.getByRole('button', { name: 'Повторить', exact: true }).waitFor({ timeout: 20000 });
    await page.waitForTimeout(150);
    assert(await alerts().count() === 1, 'Concurrent failures must render one alert');
    assert(!/Request failed|Internal Server Error/.test(await alerts().innerText()), 'Technical transport text must not be shown');
  };

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${origin}/roadmap/admin/roles`);
  await waitForError();
  assert((await alerts().innerText()).match(/Сервис временно недоступен/g)?.length === 1, 'Identical failure descriptions must be deduplicated');
  await page.screenshot({ path: 'output/playwright/error-notice-dark.png', animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Mobile view must not overflow');
  const alertBounds = await alerts().boundingBox();
  const retryBounds = await alerts().getByRole('button').boundingBox();
  assert(retryBounds.x >= alertBounds.x && retryBounds.x + retryBounds.width <= alertBounds.x + alertBounds.width, 'Mobile retry button must stay inside the notice');
  await page.screenshot({ path: 'output/playwright/error-notice-mobile.png', animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => document.documentElement.classList.replace('dark', 'light'));
  await page.screenshot({ path: 'output/playwright/error-notice-light.png', animations: 'disabled' });

  delay = 150;
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await page.getByRole('button', { name: 'Повторяем…', exact: true }).waitFor();
  await until(async () => await page.getByRole('button', { name: 'Повторить', exact: true }).isEnabled(), 'Failed recovery must allow another attempt');
  assert(await alerts().count() === 1, 'Another failed attempt must not append duplicate alerts');

  const before = new Map(counts);
  failures.clear();
  delay = 600;
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  const busyButton = page.getByRole('button', { name: 'Повторяем…', exact: true });
  await busyButton.waitFor();
  assert(await busyButton.isDisabled(), 'Retry must be disabled until all failed queries settle');
  assert(await alerts().count() === 1, 'Notice must remain visible during recovery');
  await until(async () => await alerts().count() === 0, 'Recovered notice must disappear');
  for (const path of rolePaths) assert(counts.get(path) === before.get(path) + 1, `Retry must reload ${path} once`);
  assert(counts.get('/auth/me') === before.get('/auth/me'), 'Successful queries must not be retried');
  report.push('PASS: simultaneous role and project failures, one notice, desktop/mobile/light/dark, busy state and recovery');

  delay = 0;
  failures = new Set([usersPath]);
  await page.goto(`${origin}/roadmap/admin/roles?projectId=fixture-project`);
  const editRole = page.getByRole('button', { name: 'Настроить роль «Разработка»', exact: true });
  await editRole.click();
  const roleEditor = page.getByRole('dialog', { name: 'Настроить роль «Разработка»', exact: true });
  const retryPeople = roleEditor.getByRole('button', { name: 'Повторить', exact: true });
  await retryPeople.waitFor();
  assert(await alerts().count() === 1, 'The editor must show one notice for employee data');
  const partialBefore = new Map(counts);
  failures.clear();
  await retryPeople.click();
  await until(async () => await alerts().count() === 0, 'Partial error must recover');
  assert(counts.get(usersPath) === partialBefore.get(usersPath) + 1, 'Failed people query must be retried');
  for (const path of rolePaths) assert(counts.get(path) === partialBefore.get(path), `Successful ${path} must not be retried`);
  report.push('PASS: partial failure preserves role data and retries only the failed resource');

  const syncPath = '/roadmap/admin/users/sync';
  failures = new Set([usersPath, syncPath]);
  await page.goto(`${origin}/roadmap/admin/users`);
  await waitForError();
  await page.getByRole('button', { name: 'Синхронизировать', exact: true }).click();
  await page.getByRole('button', { name: 'Повторить загрузку', exact: true }).waitFor();
  assert(await alerts().count() === 1, 'Read and mutation failures must share one alert');
  const writesBeforeRetry = writes.length;
  failures.delete(usersPath);
  delay = 600;
  await page.getByRole('button', { name: 'Повторить загрузку', exact: true }).click();
  await page.getByRole('button', { name: 'Повторяем…', exact: true }).waitFor();
  assert(await alerts().count() === 1, 'Grouped mutation feedback must not duplicate during query recovery');
  await until(async () => await page.getByRole('button', { name: 'Повторяем…', exact: true }).count() === 0, 'Query recovery must settle');
  assert(writes.length === writesBeforeRetry, 'Retrying reads must never repeat a failed write');
  assert(await alerts().count() === 1, 'Mutation error must remain after successful read recovery');
  assert(await alerts().getByRole('button').count() === 0, 'Mutation-only feedback must not offer query recovery');
  delay = 0;
  failures.clear();
  await page.getByRole('button', { name: 'Синхронизировать', exact: true }).click();
  await until(async () => await alerts().count() === 0, 'Explicitly successful mutation must clear its error');
  report.push('PASS: read and write failures grouped, retry never replays writes, mutation error persists until explicitly resolved');

  for (const [url, paths] of [
    ['/roadmap', [projectsPath, '/roadmap/connection', '/roadmap/people', catalogPath]],
    ['/roadmap/admin/users', [usersPath]],
    ['/roadmap/admin/integrations', ['/roadmap/settings/azure-devops']],
    ['/roadmap/analytics', [projectsPath]],
    ['/roadmap/admin/access', ['/roadmap/admin/projects']],
  ]) {
    failures = new Set(paths);
    await page.goto(`${origin}${url}`);
    await waitForError();
    report.push(`PASS: one readable notice on ${url}`);
  }

  failures = new Set([fieldsPath]);
  await page.goto(`${origin}/roadmap/admin/integrations#azure-mapping`);
  await waitForError();
  await page.getByRole('textbox', { name: 'Тип задачи', exact: true }).fill('Bug');
  failures.add(settingsPath);
  failures.add(overviewPath);
  const parentBefore = new Map(counts);
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await until(async () => [settingsPath, overviewPath].every((path) => counts.get(path) >= (parentBefore.get(path) ?? 0) + 2), 'Background parent requests must fail after saving');
  await until(async () => await page.getByRole('button', { name: 'Сохранить', exact: true }).isDisabled(), 'Saving must settle');
  await page.waitForTimeout(200);
  assert(await alerts().count() === 1, 'Parent and nested field query failures must produce a single notice');
  await page.getByRole('textbox', { name: 'Тип задачи', exact: true }).fill('Story');
  await page.getByRole('textbox', { name: 'Тип задачи', exact: true }).blur();
  await page.waitForTimeout(1300);
  const mappingBefore = new Map(counts);
  failures.clear();
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await until(async () => await alerts().count() === 0, 'Nested read recovery must clear all failures');
  for (const path of [settingsPath, overviewPath, fieldsPath]) assert(counts.get(path) === mappingBefore.get(path) + 1, `Nested recovery must retry ${path} once`);
  assert(counts.get(mappingPath) === mappingBefore.get(mappingPath), 'Successful mapping settings must not refetch');
  assert(await page.getByRole('textbox', { name: 'Тип задачи', exact: true }).inputValue() === 'Story', 'Recovery must preserve the unsaved draft');
  report.push('PASS: nested integration errors grouped with parent queries; recovery preserves unsaved field settings');

  assert(writes.length === 3 && writes.filter((path) => path === syncPath).length === 2 && writes.filter((path) => path === mappingPath).length === 1, 'Only explicitly requested operations may write');
  assert(runtimeErrors.length === 0, `Unexpected runtime errors: ${runtimeErrors.join('; ')}`);
  report.push('PASS: no unintended write requests or JavaScript runtime errors');
  failures = new Set(rolePaths);
  await page.goto(`${origin}/roadmap/admin/roles`);
  await waitForError();
  await page.screenshot({ path: 'output/playwright/error-notice-preview.png', clip: { x: 256, y: 64, width: 1184, height: 248 }, animations: 'disabled' });
  return report;
}
