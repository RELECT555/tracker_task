/* Isolated browser regression for the role plan/fact table.
 * Run against a running web dev server with Playwright on NODE_PATH.
 * API routes are fixtures; this never changes server data.
 */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const baseURL = process.env.ROADMAP_TEST_URL || 'http://localhost:3000';
const member = (id, name) => ({ personExternalId: id, personName: name, personEmail: `${id}@example.test`, personIsActive: true });
const analyst = member('analyst', 'Анна Аналитик');
const tester = member('tester', 'Иван Тестировщик');
const roles = [
  { id: 'ba', projectId: 'role-project', name: 'Business Analyst', color: '#8b5cf6', azureEstimateField: 'Custom.BA', members: [analyst] },
  { id: 'qa', projectId: 'role-project', name: 'Тестирование', color: '#10b981', azureEstimateField: 'Custom.QA', members: [tester] },
  { id: 'empty', projectId: 'role-project', name: 'Пустая роль', color: '#64748b', azureEstimateField: 'Custom.Empty', members: [] },
];
const item = (id, type, title, parentExternalId, actualHours, azureCustomFields = null) => ({
  id, externalId: id, parentExternalId, type, title, state: 'Active', url: null, actualHours, azureCustomFields, allocations: [],
});
const assigned = (person) => ({ 'System.AssignedTo': { id: person.personExternalId, displayName: person.personName, uniqueName: person.personEmail } });
const plan = {
  id: 'role-project', externalId: 'role-project', name: 'Детализация проекта', url: null, syncedAt: '2026-11-15T00:00:00Z',
  canEditPlan: true, roles, azure: { writeBackEnabled: false },
  workItems: [
    item('epic', 'Epic', 'Интеграция проекта', null, 215),
    item('feature-a', 'Feature', 'Разработка интерфейса', 'epic', 120, { 'Custom.BA': 100, 'Custom.Empty': 0 }),
    item('feature-b', 'Feature', 'Проверка интеграции', 'epic', 95, { 'Custom.BA': 80, 'Custom.QA': 30 }),
    item('standalone', 'Feature', 'Отдельная фича', null, 10, { 'Custom.BA': 20 }),
    item('task-a', 'Task', 'Работа аналитика A', 'feature-a', 120, assigned(analyst)),
    item('task-b', 'Task', 'Работа аналитика B', 'feature-b', 70, assigned(analyst)),
    item('task-c', 'Task', 'Работа тестировщика', 'feature-b', 20, assigned(tester)),
    item('task-d', 'Task', 'Нераспределённая работа', 'feature-b', 5, assigned(member('unknown', 'Другой участник'))),
    item('task-e', 'Task', 'Отдельная работа', 'standalone', 10, assigned(analyst)),
  ],
};

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const unexpectedRequests = [];
    await context.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
      const payload = path === '/auth/me' ? { user: { id: 'roles-user', email: 'roles@example.test', fullName: 'Проверка ролей', roles: ['admin'], orgUnit: null, manager: null } }
        : path === '/roadmap/connection' ? { provider: 'azure-devops', configured: true, organizationUrl: '' }
          : path === '/roadmap/projects' ? { data: [{ id: plan.externalId, name: plan.name, imported: true, planSynced: true, roadmapId: plan.id }] }
            : path === '/roadmap/people' ? { data: [analyst, tester].map((entry) => ({ id: entry.personExternalId, name: entry.personName, email: entry.personEmail, isActive: true })) }
              : path === '/roadmap/admin/role-catalog' ? []
                : path === `/roadmap/projects/${plan.id}/plan` ? plan : undefined;
      if (payload === undefined || route.request().method() !== 'GET') unexpectedRequests.push(`${route.request().method()} ${path}`);
      await route.fulfill({ status: payload === undefined ? 404 : 200, contentType: 'application/json', body: JSON.stringify(payload ?? { message: 'Unexpected fixture request' }) });
    });
    await context.addInitScript(() => {
      localStorage.setItem('tracker.accessToken', 'isolated-browser-fixture');
      localStorage.setItem('tracker.sessionId', 'isolated-browser-session');
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${baseURL}/roadmap`, { waitUntil: 'networkidle' });
    await page.locator('table').waitFor({ timeout: 30000 }).catch(async (error) => {
      console.error('Table load diagnostics:', { errors, unexpectedRequests, body: (await page.locator('body').innerText()).slice(0, 2000) });
      throw error;
    });
    const columnIds = () => page.locator('table col').evaluateAll((cols) => cols.map((col) => col.dataset.columnId));
    const row = (title) => page.locator('tbody tr').filter({ hasText: title });
    const getCell = async (targetRow, id) => targetRow.locator(':scope > th, :scope > td').nth((await columnIds()).indexOf(id));
    const assertCell = async (targetRow, id, expected, message) => assert.equal((await (await getCell(targetRow, id)).innerText()).trim(), expected, message);
    const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) <= 1, `${message}: expected ${expected}, got ${actual}`);
    const settle = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const assertHeaderAlignment = async (stage) => {
      const geometry = await page.locator('table').evaluate((table) => {
        const ids = Array.from(table.querySelectorAll('col')).map((col) => col.dataset.columnId);
        const cells = Array.from(table.tBodies[0].rows[0].cells);
        return Array.from(table.tHead.querySelectorAll('th[data-column-id]')).map((header) => {
          const cell = cells[ids.indexOf(header.dataset.columnId)];
          const headerBounds = header.getBoundingClientRect();
          const cellBounds = cell.getBoundingClientRect();
          return { id: header.dataset.columnId, headerX: headerBounds.x, cellX: cellBounds.x, headerWidth: headerBounds.width, cellWidth: cellBounds.width };
        });
      });
      assert.equal(geometry.length, (await columnIds()).length, stage + ': every column has an aligned header');
      for (const entry of geometry) {
        close(entry.headerX, entry.cellX, stage + ': ' + entry.id + ' header matches its cells');
        close(entry.headerWidth, entry.cellWidth, stage + ': ' + entry.id + ' header width matches its cells');
      }
    };
    const expectedColumns = ['name', 'summary:plan', 'summary:fact', 'plan:ba', 'fact:ba', 'delta:ba', 'plan:qa', 'fact:qa', 'delta:qa', 'fact:unattributed'];
    assert.deepEqual(await columnIds(), expectedColumns, 'Each role groups adjacent plan, fact, delta; empty roles are filtered');
    await assertHeaderAlignment('Default title pin');
    const epic = row('Интеграция проекта');
    await assertCell(epic, 'summary:plan', '210 ч', 'Epic plan includes role estimates from its features');
    await assertCell(epic, 'summary:fact', '215 ч', 'Epic actual remains the imported total');
    await assertCell(epic, 'plan:ba', '180 ч', 'Analyst feature estimates roll up to the collapsed epic');
    await assertCell(epic, 'fact:ba', '190 ч', 'Fact comes from tasks assigned to the current project role member');
    await assertCell(epic, 'delta:ba', '+10 ч', 'Overrun is fact minus plan');
    await assertCell(epic, 'plan:qa', '30 ч', 'Testing plan is independent from analyst plan');
    await assertCell(epic, 'fact:qa', '20 ч', 'Testing actual is matched to the tester');
    await assertCell(epic, 'delta:qa', '−10 ч', 'Unused plan has a negative delta');
    await assertCell(epic, 'fact:unattributed', '5 ч', 'Unmatched people stay visible without being counted twice');
    const footer = page.locator('tfoot tr');
    await assertCell(footer, 'summary:plan', '230 ч', 'Project plan counts epics and standalone features once');
    await assertCell(footer, 'summary:fact', '225 ч', 'Project actual includes standalone features');
    await assertCell(footer, 'plan:ba', '200 ч', 'Project analyst plan reconciles');
    await assertCell(footer, 'fact:ba', '200 ч', 'Project analyst actual reconciles');
    console.log('PASS Azure role plans, member-based actuals, signed deltas, and reconciled totals');

    await page.getByRole('button', { name: 'Развернуть эпик Интеграция проекта', exact: true }).click();
    const feature = row('Разработка интерфейса');
    await assertCell(feature, 'summary:plan', '100 ч', 'Expanded feature total matches its role plan');
    await assertCell(feature, 'fact:ba', '120 ч', 'Feature actual maps to the same role as the epic');
    await assertCell(feature, 'delta:ba', '+20 ч', 'Feature overrun compares plan and actual side-by-side');
    await assertCell(footer, 'summary:plan', '230 ч', 'Expanding an epic does not double project totals');
    const details = page.getByRole('button', { name: 'Детализация по ролям', exact: true });
    await details.click();
    assert.deepEqual(await columnIds(), expectedColumns.slice(0, 3), 'Collapsed detail retains only totals');
    await assertCell(epic, 'summary:plan', '210 ч', 'Totals remain visible with detail hidden');
    await details.click();
    assert.deepEqual(await columnIds(), expectedColumns, 'Expanded details restore all role triples');
    const filter = page.getByRole('switch', { name: 'Только роли с планом' });
    await page.locator('label').filter({ has: filter }).click();
    assert.equal(await filter.isChecked(), false, 'The visible switch turns the planned-role filter off');
    assert.ok((await columnIds()).includes('plan:empty'), 'Turning the filter off reveals roles without plan');
    await filter.focus();
    await page.keyboard.press('Space');
    assert.equal(await filter.isChecked(), true, 'The planned-role switch can also be toggled with the keyboard');
    assert.deepEqual(await columnIds(), expectedColumns, 'Turning it on hides the empty role again');
    console.log('PASS detail collapse, epic expansion, and strict planned-role filtering');
    if (process.env.ROADMAP_TEST_SCREENSHOT) await page.screenshot({ path: process.env.ROADMAP_TEST_SCREENSHOT, fullPage: true });

    const pin = page.getByRole('combobox', { name: 'Закрепление столбцов' });
    const setPin = async (label) => {
      await pin.click();
      await page.getByRole('option', { name: label, exact: true }).click();
      await settle();
    };
    const scroll = async (amount) => {
      await page.locator('table').evaluate((table, value) => { table.parentElement.scrollLeft = value; }, amount);
      await settle();
    };
    const x = async (locator) => (await locator.boundingBox()).x;
    const first = await getCell(epic, 'name');
    await scroll(0);
    const initialX = await x(first);
    await scroll(280);
    close(await x(first), initialX, 'Pinned title remains visible while scrolling');
    await assertHeaderAlignment('Title pin after horizontal scroll');
    await setPin('Название и итоги');
    await scroll(0);
    const totalPlan = await getCell(epic, 'summary:plan');
    const totalFact = await getCell(epic, 'summary:fact');
    const planX = await x(totalPlan);
    const factX = await x(totalFact);
    await scroll(280);
    close(await x(first), initialX, 'Title stays fixed with pinned totals');
    close(await x(totalPlan), planX, 'Plan total stays fixed');
    close(await x(totalFact), factX, 'Actual total stays fixed');
    await assertHeaderAlignment('Pinned title and totals after horizontal scroll');
    if (process.env.ROADMAP_TEST_SCREENSHOT) await page.screenshot({ path: process.env.ROADMAP_TEST_SCREENSHOT.replace(/\.png$/i, '-pinned.png'), fullPage: true });
    await setPin('Без закрепления');
    await scroll(0);
    const freeX = await x(first);
    await scroll(280);
    assert.ok(await x(first) < freeX - 200, 'Unpinned title scrolls horizontally');
    await assertHeaderAlignment('No pinned columns after horizontal scroll');
    await setPin('Название и итоги');
    await page.setViewportSize({ width: 390, height: 844 });
    await scroll(0);
    const mobileX = await x(first);
    await scroll(200);
    assert.ok(await x(first) < mobileX - 150, 'Narrow screens can scroll past the title and totals');
    await assertHeaderAlignment('Mobile after horizontal scroll');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'Mobile table does not overflow the page');
    console.log('PASS first-column and totals pinning, unpinning, and mobile scroll');
    if (process.env.ROADMAP_TEST_SCREENSHOT) await page.screenshot({ path: process.env.ROADMAP_TEST_SCREENSHOT.replace(/\.png$/i, '-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1600, height: 1000 });
    await scroll(0);
    const now = new Date();
    const orphan = item('orphan', 'Task', 'План без родителя', null, 0);
    orphan.allocations = [{
      id: 'orphan-allocation', roleId: 'ba', role: roles[0], personExternalId: analyst.personExternalId,
      personName: analyst.personName, personEmail: analyst.personEmail, estimatedHours: 12, periods: [],
      quarterKey: `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`,
    }];
    plan.workItems.push(orphan);
    await page.reload({ waitUntil: 'networkidle' });
    const unattached = row('План без эпика / фичи');
    await unattached.waitFor();
    await assertCell(unattached, 'summary:plan', '12 ч', 'Plans without a visible ancestor remain visible');
    await assertCell(unattached, 'plan:ba', '12 ч', 'Unattached plans keep their role');
    await assertCell(page.locator('tfoot tr'), 'summary:plan', '242 ч', 'Project total preserves all valid assignments');
    await assertCell(page.locator('tfoot tr'), 'plan:ba', '212 ч', 'Role total includes unattached assignments once');
    console.log('PASS unattached assignments stay visible and reconcile with project and role totals');
    assert.deepEqual(unexpectedRequests, [], 'All network requests use expected read-only fixtures');
    assert.deepEqual(errors, [], 'No uncaught browser errors');
    console.log('PASS isolated fixture requests and no browser errors');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
