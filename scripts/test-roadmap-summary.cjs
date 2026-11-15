/* Run against the web dev server with Playwright on NODE_PATH.
 * Read-only API fixtures verify summary calculations, selection and layout.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseURL = process.env.ROADMAP_TEST_URL || 'http://localhost:3000';
const output = path.resolve(__dirname, '../output');
const now = new Date();
const year = now.getFullYear();
const quarter = Math.floor(now.getMonth() / 3) + 1;
const quarterKey = `${year}-Q${quarter}`;
const firstMonth = `${year}-${String((quarter - 1) * 3 + 1).padStart(2, '0')}`;
const secondMonth = `${year}-${String((quarter - 1) * 3 + 2).padStart(2, '0')}`;
const monthName = new Intl.DateTimeFormat('ru-RU', { month: 'long', timeZone: 'UTC' }).format(new Date(`${firstMonth}-01T00:00:00Z`));
const monthLabel = `${monthName[0].toUpperCase()}${monthName.slice(1)} · ${firstMonth.slice(2)}`;
const member = (id, name) => ({ personExternalId: id, personName: name, personEmail: `${id}@example.test`, personIsActive: true });
const alice = member('alice', 'Анна Аналитик');
const bob = member('bob', 'Борис Тестировщик');
const claire = member('claire', 'Клара Руководитель');
const dave = member('dave', 'Денис Разработчик');
const role = (id, name, person) => ({ id, name, color: '#6366f1', members: [person] });
const rolesA = [role('a-ba', 'Business Analyst', alice), role('a-qa', 'Тестирование', bob), role('a-empty', 'Руководитель', claire)];
const rolesB = [role('b-ba', 'Business Analyst', alice), role('b-dev', 'Разработка', dave)];
const allocation = (id, assignedRole, person, hours, monthlyHours) => ({
  id, roleId: assignedRole.id, role: assignedRole,
  personExternalId: person.personExternalId, personName: person.personName, personEmail: person.personEmail,
  quarterKey, estimatedHours: hours, actualHours: 0,
  periods: [
    { monthKey: firstMonth, label: firstMonth, startsAt: `${firstMonth}-01`, endsAt: `${firstMonth}-28`, hours: monthlyHours },
    { monthKey: secondMonth, label: secondMonth, startsAt: `${secondMonth}-01`, endsAt: `${secondMonth}-28`, hours: hours - monthlyHours },
  ],
});
const item = (id, type, title, parent, actual, allocations = []) => ({
  id, externalId: id, type, title, parentExternalId: parent, actualHours: actual,
  state: 'Active', url: null, azureCustomFields: null, allocations,
});
const plans = [
  {
    id: 'summary-a', externalId: 'summary-a', name: 'Альфа · План проекта', url: null,
    syncedAt: '2026-11-15T00:00:00Z', canEditPlan: true, azure: { writeBackEnabled: false }, roles: rolesA,
    workItems: [
      item('a-epic', 'Epic', 'Альфа · Интеграция', null, 50),
      item('a-feature-1', 'Feature', 'Альфа · Анализ', 'a-epic', 35, [allocation('a-1', rolesA[0], alice, 40, 12)]),
      item('a-feature-2', 'Feature', 'Альфа · Проверка', 'a-epic', 15, [allocation('a-2', rolesA[1], bob, 20, 0)]),
    ],
  },
  {
    id: 'summary-b', externalId: 'summary-b', name: 'Бета · План проекта', url: null,
    syncedAt: '2026-11-15T00:00:00Z', canEditPlan: true, azure: { writeBackEnabled: false }, roles: rolesB,
    workItems: [
      item('b-epic', 'Epic', 'Бета · Развитие', null, 40),
      item('b-feature', 'Feature', 'Бета · Интерфейс', 'b-epic', 40, [
        allocation('b-1', rolesB[0], alice, 60, 8), allocation('b-2', rolesB[1], dave, 10, 2),
      ]),
    ],
  },
];
const facts = {
  'summary-a': { workItems: { 'a-epic': 7, 'a-feature-1': 5, 'a-feature-2': 2 }, allocations: { 'a-1': 5, 'a-2': 2 }, totalHours: 7 },
  'summary-b': { workItems: { 'b-epic': 3, 'b-feature': 3 }, allocations: { 'b-1': 2, 'b-2': 1 }, totalHours: 3 },
};

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const unexpectedRequests = [];
    const factRequestCounts = {};
    let failSecondProject = false;
    let tablePreferences = null;
    await context.route('**/api/v1/**', async (route) => {
      const url = new URL(route.request().url());
      const pathname = url.pathname.replace('/api/v1', '');
      if (pathname === '/roadmap/preferences/table' && ['GET', 'PUT'].includes(route.request().method())) {
        if (route.request().method() === 'PUT') tablePreferences = route.request().postDataJSON();
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ preferences: tablePreferences }) });
        return;
      }
      const projectMatch = pathname.match(/^\/roadmap\/projects\/([^/]+)\/(plan|fact)$/);
      const project = projectMatch && plans.find((entry) => entry.id === projectMatch[1]);
      let status = 200;
      let payload;
      if (pathname === '/auth/me') payload = { user: { id: 'summary-user', email: 'summary@example.test', fullName: 'Проверка сводки', roles: ['admin'], orgUnit: null, manager: null } };
      else if (pathname === '/roadmap/connection') payload = { provider: 'azure-devops', configured: true, organizationUrl: '' };
      else if (pathname === '/roadmap/projects') payload = { data: plans.map((entry) => ({ id: entry.externalId, name: entry.name, imported: true, planSynced: true, roadmapId: entry.id })) };
      else if (pathname === '/roadmap/people') payload = { data: [alice, bob, claire, dave].map((entry) => ({ id: entry.personExternalId, name: entry.personName, email: entry.personEmail, isActive: true })) };
      else if (pathname === '/roadmap/admin/role-catalog') payload = [];
      else if (project && projectMatch[2] === 'fact') {
        assert.equal(url.searchParams.get('monthKey'), firstMonth, 'Monthly fact uses the selected month');
        factRequestCounts[project.id] = (factRequestCounts[project.id] ?? 0) + 1;
        payload = facts[project.id];
      } else if (project) {
        if (failSecondProject && project.id === 'summary-b') { status = 503; payload = { message: 'Проект временно недоступен' }; }
        else payload = project;
      }
      if (payload === undefined || route.request().method() !== 'GET') {
        unexpectedRequests.push(`${route.request().method()} ${pathname}`);
        status = 404;
      }
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload ?? { message: 'Unexpected fixture request' }) });
    });
    await context.addInitScript(() => {
      localStorage.setItem('tracker.accessToken', 'isolated-browser-fixture');
      localStorage.setItem('tracker.sessionId', 'isolated-browser-session');
    });
    const page = await context.newPage();
    const browserErrors = [];
    page.on('pageerror', (error) => browserErrors.push(error.message));
    const summary = page.locator('dl[aria-label="Сводка плана"]');
    const summaryValues = () => summary.evaluate((element) => Object.fromEntries(Array.from(element.querySelectorAll('dt')).map((dt) => [dt.textContent.trim(), dt.parentElement.querySelector('dd').textContent.trim().replace(/(\d)ч$/, '$1 ч')])));
    const assertSummary = async (expected, stage) => {
      await summary.waitFor({ timeout: 30000 });
      await page.waitForFunction((values) => {
        const element = document.querySelector('dl[aria-label="Сводка плана"]');
        if (!element) return false;
        const actual = Object.fromEntries(Array.from(element.querySelectorAll('dt')).map((dt) => [dt.textContent.trim(), dt.parentElement.querySelector('dd').textContent.trim().replace(/(\d)ч$/, '$1 ч')]));
        return Object.entries(values).every(([key, value]) => actual[key] === value);
      }, expected, { timeout: 15000 }).catch(async (error) => {
        console.error(stage, { expected, actual: await summaryValues() });
        throw error;
      });
      const actual = await summaryValues();
      for (const [key, value] of Object.entries(expected)) assert.equal(actual[key], value, `${stage}: ${key}`);
    };
    const setProject = async (label) => {
      await page.getByRole('combobox', { name: 'Выбрать проект Azure DevOps' }).click();
      await page.getByRole('option').filter({ hasText: label }).click();
    };
    const setMonth = async (label) => {
      await page.getByRole('combobox', { name: 'Период плана' }).click();
      await page.getByRole('option', { name: label, exact: true }).click();
    };
    const toggleRoles = async () => {
      const control = page.getByRole('switch', { name: 'Только роли с планом' });
      await control.focus();
      await page.keyboard.press('Space');
    };
    const assertOverviewRow = async (text, expected) => {
      const row = page.locator('tbody tr').filter({ hasText: text });
      assert.deepEqual((await row.locator(':scope > td').allTextContents()).map((value) => value.trim()), expected, `Overview row ${text}`);
    };
    const singleQuarter = { Эпики: '1', Фичи: '2', План: '60 ч', 'Факт всего': '50 ч', Ролей: '2', Участников: '2' };
    const allQuarter = { Эпики: '2', Фичи: '3', План: '130 ч', 'Факт всего': '90 ч', Ролей: '3', Участников: '3' };
    await page.goto(`${baseURL}/roadmap`, { waitUntil: 'networkidle' });
    await assertSummary(singleQuarter, 'Selected project quarter');
    const globalHeader = page.getByRole('banner');
    assert.equal(await globalHeader.locator('dl').count(), 0, 'Analytics no longer occupies the global header');
    assert.ok((await globalHeader.boundingBox()).height <= 58, 'Global header is compact');
    await page.getByRole('button', { name: 'Предыдущий квартал', exact: true }).click();
    await assertSummary({ План: '0 ч', Ролей: '0', Участников: '0' }, 'Quarter filter');
    await page.getByRole('button', { name: 'Следующий квартал', exact: true }).click();
    await assertSummary(singleQuarter, 'Restored quarter');
    await toggleRoles();
    await assertSummary({ Ролей: '3', Участников: '3' }, 'All project roles');
    await toggleRoles();
    await setMonth(monthLabel);
    await assertSummary({ Эпики: '1', Фичи: '2', План: '12 ч', Факт: '7 ч', Ролей: '1', Участников: '1' }, 'Selected project month');
    await setMonth('Весь квартал');
    await assertSummary(singleQuarter, 'Restored single project');
    await page.screenshot({ path: path.join(output, 'roadmap-summary-desktop.png'), fullPage: true });
    console.log('PASS selected-project summary, quarter/month filtering, role/member filtering and compact header');

    await setProject('Все проекты');
    await assertSummary(allQuarter, 'All projects quarter');
    assert.equal(await page.locator('tbody tr').count(), 2, 'All projects initially collapse to project rows');
    await assertOverviewRow(plans[0].name, ['1', '2', '60 ч', '50 ч', '2', '2']);
    await assertOverviewRow(plans[1].name, ['1', '1', '70 ч', '40 ч', '2', '2']);
    await page.getByRole('button', { name: `Развернуть проект ${plans[0].name}`, exact: true }).click();
    await page.getByRole('button', { name: 'Развернуть эпик Альфа · Интеграция', exact: true }).click();
    await page.getByText('Альфа · Анализ', { exact: true }).waitFor();
    await assertOverviewRow('Альфа · Интеграция', ['1', '2', '60 ч', '50 ч', '2', '2']);
    await assertOverviewRow('Альфа · Анализ', ['0', '1', '40 ч', '35 ч', '1', '1']);
    await assertSummary(allQuarter, 'Expansion does not double totals');
    await toggleRoles();
    await assertSummary({ Ролей: '4', Участников: '4' }, 'Aggregate includes unplanned roles only when requested');
    await toggleRoles();
    await setMonth(monthLabel);
    await assertSummary({ Эпики: '2', Фичи: '3', План: '22 ч', Факт: '10 ч', Ролей: '2', Участников: '2' }, 'All projects month');
    await setMonth('Весь квартал');
    await assertSummary(allQuarter, 'Restored aggregate quarter');
    await page.reload({ waitUntil: 'networkidle' });
    await assertSummary(allQuarter, 'All projects selection survives reload');
    assert.match(await page.getByRole('combobox', { name: 'Выбрать проект Azure DevOps' }).innerText(), /Все проекты/);
    assert.equal(await page.locator('tbody tr').count(), 2, 'Reload returns to collapsed project hierarchy');
    await page.screenshot({ path: path.join(output, 'roadmap-summary-all-projects.png'), fullPage: true });
    console.log('PASS shared-role/person deduplication, all-project hierarchy, period filtering and selection persistence');

    failSecondProject = true;
    await page.reload({ waitUntil: 'networkidle' });
    await assertSummary({ Эпики: '—', Фичи: '—', План: '—', 'Факт всего': '—', Ролей: '—', Участников: '—' }, 'Failed project prevents partial aggregate');
    await assertOverviewRow(plans[1].name, ['—', '—', '—', '—', '—', '—']);
    failSecondProject = false;
    await page.getByRole('button', { name: /Повторить/ }).last().click();
    await assertSummary(allQuarter, 'Retry restores complete aggregate');
    console.log('PASS project error has no misleading partial total and retry recovers');

    await page.setViewportSize({ width: 390, height: 844 });
    await assertSummary(allQuarter, 'Mobile aggregate');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'All-project table does not overflow the mobile page');
    await page.screenshot({ path: path.join(output, 'roadmap-summary-mobile.png'), fullPage: true });
    await setProject(plans[0].name);
    await assertSummary(singleQuarter, 'Return to single project');
    await page.getByRole('button', { name: 'Детализация по ролям', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'Single-project summary does not overflow the mobile page');
    await page.screenshot({ path: path.join(output, 'roadmap-summary-single-mobile.png'), fullPage: true });

    await page.setViewportSize({ width: 1600, height: 1000 });
    await setProject('Все проекты');
    await setMonth(monthLabel);
    await assertSummary({ План: '22 ч', Факт: '10 ч' }, 'Monthly cache before import');
    const previousFactRequests = factRequestCounts['summary-b'];
    await setProject(plans[0].name);
    plans[1].syncedAt = '2026-11-15T00:05:00Z';
    facts['summary-b'] = { workItems: { 'b-epic': 11, 'b-feature': 11 }, allocations: { 'b-1': 9, 'b-2': 2 }, totalHours: 11 };
    // Make the plan cache stale while monthly fact remains inside its five-minute cache.
    await page.evaluate(() => {
      const realDateNow = Date.now;
      Date.now = () => realDateNow() + 31_000;
    });
    const refreshedPlan = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith('/roadmap/projects/summary-b/plan'));
    await setProject('Все проекты');
    await refreshedPlan;
    await assertSummary({ План: '22 ч', Факт: '18 ч' }, 'A new import invalidates cached monthly fact');
    assert.ok(factRequestCounts['summary-b'] > previousFactRequests, 'Changed syncedAt triggers a monthly-fact request without manual refresh');
    console.log('PASS monthly fact cache invalidation after a newer project import');

    await setMonth('Весь квартал');
    plans[1].workItems = [item('b-orphan', 'Task', 'Бета · Работа без родителя', null, 0, [allocation('b-orphan-allocation', rolesB[0], alice, 9, 3)])];
    await page.reload({ waitUntil: 'networkidle' });
    await assertSummary({ Эпики: '1', Фичи: '2', План: '69 ч', 'Факт всего': '50 ч', Ролей: '2', Участников: '2' }, 'Unattached task remains included');
    const orphanProjectToggle = page.getByRole('button', { name: `Развернуть проект ${plans[1].name}`, exact: true });
    assert.equal(await orphanProjectToggle.isEnabled(), true, 'Project with only unattached assignments can expand');
    await orphanProjectToggle.click();
    await page.locator('tbody tr').filter({ hasText: 'План без эпика / фичи' }).waitFor();
    await assertOverviewRow('План без эпика / фичи', ['0', '0', '9 ч', '—', '1', '1']);
    console.log('PASS orphan task plan stays visible in an expandable project with no Epic or Feature');

    assert.deepEqual(unexpectedRequests, [], 'Every API request used an expected read-only fixture');
    assert.deepEqual(browserErrors, [], 'No uncaught browser errors');
    console.log('PASS mobile containment, return to editable role table, isolated network and no browser errors');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
