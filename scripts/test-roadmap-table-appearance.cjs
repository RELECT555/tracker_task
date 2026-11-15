/* Personal table appearance browser regression.
 * Run with Playwright on NODE_PATH and the local web server running.
 * All API requests are isolated fixtures; no account or project data is changed.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { DEFAULT_ROADMAP_TABLE_PREFERENCES: defaults } = require('@tracker/shared');

const baseURL = process.env.ROADMAP_TEST_URL || 'http://localhost:3000';
const output = path.resolve(__dirname, '../output');
const person = { personExternalId: 'analyst', personName: 'Анна Аналитик', personEmail: 'analyst@example.test', personIsActive: true };
const item = (id, type, title, parentExternalId, actualHours, azureCustomFields = null) => ({ id, externalId: id, type, title, parentExternalId, actualHours, azureCustomFields, state: 'Active', url: null, allocations: [] });
const plans = ['Альфа', 'Бета'].map((name, index) => {
  const id = `appearance-${index}`;
  return {
    id, externalId: id, name: `${name} · Настройка таблицы`, syncedAt: '2026-11-15T00:00:00Z', url: null,
    canEditPlan: false, azure: { writeBackEnabled: false },
    roles: [{ id: 'analyst', projectId: id, name: 'Аналитик', color: '#6366f1', azureEstimateField: 'Custom.Plan', members: [person] }],
    workItems: [
      item(`${id}-epic`, 'Epic', `${name} · Развитие проекта`, null, 12),
      item(`${id}-feature`, 'Feature', `${name} · Разработка пользовательского интерфейса`, `${id}-epic`, 12, { 'Custom.Plan': 10 }),
      item(`${id}-task`, 'Task', `${name} · Работа аналитика`, `${id}-feature`, 12, { 'System.AssignedTo': { id: person.personExternalId, displayName: person.personName, uniqueName: person.personEmail } }),
    ],
  };
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(check, message) {
  for (let attempt = 0; attempt < 160; attempt++) {
    if (await check()) return;
    await sleep(50);
  }
  throw new Error(`Timed out: ${message}`);
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const stored = new Map();
  const writes = [];
  const unexpected = [];
  const browserErrors = [];
  let failNextSave = false;
  let slowSave = false;
  const failReadFor = new Set();
  const createContext = async (userId = 'appearance-alice', legacy = false) => {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    await context.addInitScript(({ userId, legacy }) => {
      if (location.origin === 'null') return;
      if (!localStorage.getItem('tracker.accessToken')) {
        localStorage.setItem('tracker.accessToken', userId);
        localStorage.setItem('tracker.sessionId', `session-${userId}`);
      }
      if (legacy && !localStorage.getItem('appearance-legacy-seeded')) {
        localStorage.setItem(`tracker.roadmap.column-widths.v1:${userId}`, JSON.stringify({ name: 620 }));
        localStorage.setItem('appearance-legacy-seeded', 'yes');
      }
    }, { userId, legacy });
    await context.route('**/api/v1/**', async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname.replace('/api/v1', '');
      const currentUser = request.headers().authorization?.replace(/^Bearer /, '') ?? userId;
      let payload;
      if (pathname === '/roadmap/preferences/table') {
        if (request.method() === 'GET' && failReadFor.delete(currentUser)) {
          await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Temporary read fixture failure' }) });
          return;
        }
        if (request.method() === 'PUT') {
          const preferences = request.postDataJSON();
          writes.push({ userId: currentUser, preferences });
          if (slowSave) await sleep(900);
          if (failNextSave) {
            failNextSave = false;
            await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Temporary fixture failure' }) });
            return;
          }
          stored.set(currentUser, preferences);
        }
        payload = { preferences: stored.get(currentUser) ?? null };
      } else if (pathname === '/auth/me') {
        payload = { user: { id: currentUser, email: `${currentUser}@example.test`, fullName: 'Проверка личных настроек', roles: ['viewer'], orgUnit: null, manager: null } };
      } else if (pathname === '/roadmap/projects') {
        payload = { data: plans.map((entry) => ({ id: entry.id, name: entry.name, imported: true, planSynced: true, roadmapId: entry.id })) };
      } else if (pathname === '/roadmap/connection') {
        payload = { provider: 'azure-devops', configured: true, organizationUrl: '' };
      } else {
        const match = pathname.match(/^\/roadmap\/projects\/([^/]+)\/plan$/);
        if (match) payload = plans.find((entry) => entry.id === match[1]);
      }
      if (payload === undefined) unexpected.push(`${request.method()} ${pathname}`);
      await route.fulfill({ status: payload === undefined ? 404 : 200, contentType: 'application/json', body: JSON.stringify(payload ?? { message: 'Unexpected fixture request' }) });
    });
    context.on('page', (page) => page.on('pageerror', (error) => browserErrors.push(error.message)));
    return context;
  };

  try {
    const context = await createContext('appearance-alice', true);
    const page = await context.newPage();
    const panel = page.getByRole('dialog', { name: 'Вид таблицы', exact: true });
    const open = async () => { await page.getByRole('button', { name: 'Вид таблицы', exact: true }).click(); await panel.waitFor(); };
    const close = async () => { await panel.getByRole('button', { name: 'Закрыть настройки таблицы' }).click(); };
    const section = async (name) => { await panel.getByRole('button', { name, exact: true }).click(); };
    const setTheme = async (theme) => {
      const label = theme === 'dark' ? 'Тёмная' : 'Светлая';
      const themeButton = page.getByRole('button', { name: /^Тема:/ });
      for (let attempt = 0; attempt < 3 && await themeButton.getAttribute('title') !== `Тема: ${label}`; attempt++) await themeButton.click();
      await page.waitForFunction((theme) => document.documentElement.classList.contains(theme), theme);
      // Let the existing short color transitions finish before capturing contrast.
      await sleep(250);
    };
    const assertContrast = async (stage) => {
      const samples = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d');
        const luminance = (color) => {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, 1, 1);
          const channels = Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3).map((value) => value / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
          return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
        };
        const epic = document.querySelector('table.roadmap-plan-table [data-row-kind="epic"]');
        const head = document.querySelector('table.roadmap-plan-table thead tr');
        const foot = document.querySelector('table.roadmap-plan-table tfoot tr');
        const dialog = document.querySelector('dialog[open]');
        const offSwitch = dialog?.querySelector('input[role="switch"]:not(:checked)');
        return [
          ['epic', epic?.querySelector('[data-plan-title]'), epic],
          ['header', head?.querySelector('th'), head],
          ['footer', foot?.querySelector('th'), foot],
          ['close', dialog?.querySelector('[aria-label="Закрыть настройки таблицы"]'), dialog],
          ['switch-off', offSwitch?.parentElement.lastElementChild, offSwitch?.nextElementSibling, 'backgroundColor'],
        ].map(([name, foreground, background, property = 'color']) => {
          const fg = getComputedStyle(foreground)[property];
          const bg = getComputedStyle(background).backgroundColor;
          const a = luminance(fg);
          const b = luminance(bg);
          return { name, fg, bg, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
        });
      });
      for (const sample of samples) {
        if (sample.name === 'switch-off' && !/^dark/i.test(stage)) continue;
        assert.ok(sample.ratio >= (sample.name === 'close' || sample.name === 'switch-off' ? 3 : 4.5), `${stage} ${sample.name} contrast: ${JSON.stringify(sample)}`);
      }
      console.log(`PASS ${stage} contrast: ${samples.map((sample) => `${sample.name} ${sample.ratio.toFixed(1)}:1`).join(', ')}`);
    };
    const selectProject = async (name) => {
      await page.getByRole('combobox', { name: 'Выбрать проект Azure DevOps' }).click();
      await page.getByRole('option').filter({ hasText: name }).click();
    };
    const appearance = () => page.locator('.roadmap-table-appearance').first();
    const columnIds = () => page.locator('table col[data-column-id]').evaluateAll((cols) => cols.map((col) => col.dataset.columnId));
    const assertAligned = async (stage) => {
      const result = await page.locator('table.roadmap-plan-table').evaluate((table) => {
        const ids = Array.from(table.querySelectorAll('col[data-column-id]')).map((col) => col.dataset.columnId);
        const body = table.tBodies[0].rows[0];
        const cells = Array.from(body.cells);
        const headers = Array.from(table.tHead.querySelectorAll('th[data-column-id]'));
        const widths = headers.map((header) => {
          const cell = cells[ids.indexOf(header.dataset.columnId)];
          if (!cell) return { id: header.dataset.columnId, missing: true };
          const a = header.getBoundingClientRect();
          const b = cell.getBoundingClientRect();
          return { id: header.dataset.columnId, x: Math.abs(a.x - b.x), width: Math.abs(a.width - b.width) };
        });
        return { columns: ids.length, headers: headers.length, rowCounts: Array.from(table.querySelectorAll('tbody tr, tfoot tr')).map((row) => row.cells.length), widths };
      });
      assert.equal(result.headers, result.columns, `${stage}: leaf headers match columns`);
      assert.ok(result.rowCounts.every((count) => count === result.columns), `${stage}: body/footer match columns`);
      assert.ok(result.widths.every((entry) => !entry.missing && entry.x < 1.1 && entry.width < 1.1), `${stage}: headers align ${JSON.stringify(result.widths)}`);
    };
    await page.goto(`${baseURL}/roadmap`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Вид таблицы', exact: true }).waitFor({ timeout: 30000 });
    await waitFor(async () => await page.getByRole('button', { name: 'Вид таблицы', exact: true }).isEnabled(), 'preferences ready');
    assert.equal(await appearance().getAttribute('data-density'), 'standard');
    assert.ok(await page.getByRole('button', { name: 'Сбросить ширину', exact: true }).isVisible(), 'Legacy user widths were loaded');
    await assertAligned('Baseline');
    const baselinePadding = await page.locator('table tbody tr').first().locator('th').evaluate((cell) => getComputedStyle(cell).paddingTop);
    for (const theme of ['light', 'dark']) {
      await setTheme(theme);
      await open();
      for (const name of ['Базовая', 'Графит', 'Кобальт', 'Бирюза', 'Ирис', 'Медь']) {
        await panel.getByRole('button', { name, exact: true }).click();
        await sleep(250);
        await assertContrast(`${theme} ${name}`);
      }
      await close();
    }
    await setTheme('light');
    await open();
    await panel.getByRole('button', { name: 'Кобальт', exact: true }).click();
    await panel.getByRole('button', { name: 'Компактно', exact: true }).click();
    await panel.getByRole('combobox', { name: /Размер текста/ }).selectOption('large');
    await panel.getByLabel('Переносить названия', { exact: true }).uncheck();
    await panel.getByLabel('Чередовать фон строк', { exact: true }).check();
    await panel.getByRole('combobox', { name: /Разделители/ }).selectOption('strong');
    await section('Столбцы');
    await panel.getByLabel('Показывать факт', { exact: true }).uncheck();
    await panel.getByLabel('Показывать дельту по ролям', { exact: true }).uncheck();
    await waitFor(() => stored.get('appearance-alice')?.showDelta === false, 'appearance saved');
    assert.equal(stored.get('appearance-alice').columnWidths.name, 620, 'Legacy width migrates with first account save');
    assert.equal(await appearance().getAttribute('data-density'), 'compact');
    assert.equal(await appearance().getAttribute('data-font-size'), 'large');
    assert.equal(await appearance().getAttribute('data-wrap'), 'false');
    assert.notEqual(await page.locator('table tbody tr').first().locator('th').evaluate((cell) => getComputedStyle(cell).paddingTop), baselinePadding, 'Density changes rendered cell spacing');
    await close();
    assert.ok((await columnIds()).every((id) => !id.includes('fact') && !id.includes('delta')), 'Hidden fact/delta removes their actual columns');
    await assertAligned('Hidden fact and delta');
    await open();
    await section('Столбцы');
    await panel.getByLabel('Показывать дельту по ролям', { exact: true }).check();
    await panel.getByRole('combobox', { name: /Закрепление столбцов/ }).selectOption('totals');
    await close();
    assert.ok((await columnIds()).includes('delta:analyst') && !(await columnIds()).includes('summary:fact'));
    await assertAligned('Fact hidden, delta visible, totals pinned');
    await open();
    await section('Столбцы');
    await panel.getByLabel('Показывать факт', { exact: true }).check();
    await panel.getByLabel('Показывать дельту по ролям', { exact: true }).uncheck();
    await close();
    assert.ok((await columnIds()).includes('summary:fact') && !(await columnIds()).includes('delta:analyst'));
    await assertAligned('Fact visible, delta hidden, totals pinned');
    await open();
    await panel.locator('summary').filter({ hasText: 'Свои цвета' }).click();
    await panel.getByLabel('Шапка таблицы', { exact: true }).fill('#903f65');
    await waitFor(() => stored.get('appearance-alice')?.headerTint === '#903f65', 'manual tint saves');
    await section('Столбцы');
    await panel.getByLabel('Показывать факт', { exact: true }).uncheck();
    await panel.getByRole('combobox', { name: /Закрепление столбцов/ }).selectOption('name');
    await close();
    console.log('PASS viewer customization, live preview, legacy width transfer, and hidden-column alignment');

    await selectProject(plans[1].name);
    await page.getByText('Бета · Развитие проекта', { exact: true }).waitFor();
    assert.equal(await appearance().getAttribute('data-density'), 'compact', 'Settings apply to another project');
    await assertAligned('Second project');
    await selectProject('Все проекты');
    assert.equal(await appearance().getAttribute('data-density'), 'compact', 'Settings apply to the all-project overview');
    await open();
    await panel.getByRole('button', { name: 'Бирюза', exact: true }).click();
    await close();
    await waitFor(() => stored.get('appearance-alice')?.headerTint === '#0f766e', 'overview setting saved');
    await selectProject(plans[0].name);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await appearance().getAttribute('data-density'), 'compact', 'Account setting survives reload');
    assert.equal(await appearance().getAttribute('data-header-tint'), 'true');
    const secondContext = await createContext();
    const secondPage = await secondContext.newPage();
    await secondPage.goto(`${baseURL}/roadmap`, { waitUntil: 'networkidle' });
    await secondPage.locator('.roadmap-table-appearance[data-density="compact"]').waitFor();
    assert.equal(await secondPage.locator('.roadmap-table-appearance').first().getAttribute('data-header-tint'), 'true', 'New browser context restores account settings without local storage');
    await secondContext.close();
    console.log('PASS project/overview/reload and separate-browser persistence');

    await open();
    slowSave = true;
    const countBefore = writes.length;
    await panel.getByRole('button', { name: 'Просторно', exact: true }).click();
    await waitFor(() => writes.length > countBefore, 'first slow save starts');
    await panel.getByRole('button', { name: 'Обычно', exact: true }).click();
    await panel.getByRole('combobox', { name: /Размер текста/ }).selectOption('small');
    await waitFor(() => stored.get('appearance-alice')?.density === 'standard' && stored.get('appearance-alice')?.fontSize === 'small', 'last edit survives earlier in-flight save');
    slowSave = false;
    failNextSave = true;
    await panel.getByRole('button', { name: 'Медь', exact: true }).click();
    await panel.getByText('Не удалось сохранить настройки.', { exact: true }).waitFor();
    assert.equal(await panel.getByRole('button', { name: 'Медь', exact: true }).getAttribute('aria-pressed'), 'true', 'Save failure keeps the local preview');
    await panel.getByRole('button', { name: 'Повторить', exact: true }).click();
    await waitFor(() => stored.get('appearance-alice')?.headerTint === '#a45d38', 'retry saves the current snapshot');
    await panel.getByText('Настройки сохранены в вашем аккаунте', { exact: true }).waitFor();
    await close();
    await setTheme('light');
    await open();
    await panel.getByRole('button', { name: 'Кобальт', exact: true }).click();
    await sleep(250);
    await assertContrast('Light');
    await panel.getByText('Настройки сохранены в вашем аккаунте', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'roadmap-table-appearance-desktop.png'), fullPage: true });
    await close();
    await setTheme('dark');
    await open();
    await panel.getByRole('button', { name: 'Ирис', exact: true }).click();
    await sleep(250);
    await assertContrast('Dark');
    await panel.getByText('Настройки сохранены в вашем аккаунте', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'roadmap-table-appearance-desktop-dark.png'), fullPage: true });
    await section('Столбцы');
    await page.screenshot({ path: path.join(output, 'roadmap-table-appearance-columns-dark.png'), fullPage: true });
    await close();
    await setTheme('light');
    await open();
    console.log('PASS serialized rapid saves and failure/retry without losing preview');

    await panel.getByRole('button', { name: 'Вернуть базовый вид', exact: true }).click();
    await waitFor(() => JSON.stringify(stored.get('appearance-alice')) === JSON.stringify(defaults), 'complete baseline reset');
    await close();
    await assertAligned('Reset baseline');
    assert.equal(await page.getByRole('button', { name: 'Сбросить ширину', exact: true }).count(), 0, 'Reset clears width overrides');
    assert.equal(await page.locator('table tbody tr').first().locator('th').evaluate((cell) => getComputedStyle(cell).paddingTop), baselinePadding, 'Reset restores original cell spacing');
    assert.equal(await appearance().getAttribute('data-header-tint'), 'false');
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await appearance().getAttribute('data-density'), 'standard', 'Baseline reset persists');
    await page.getByRole('button', { name: 'Включить режим фокуса', exact: true }).click();
    await open();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Выйти из режима фокуса', exact: true }).waitFor();
    assert.equal(await panel.isVisible(), false, 'Escape closes settings without leaving focus mode');
    await page.getByRole('button', { name: 'Выйти из режима фокуса', exact: true }).click();
    console.log('PASS full baseline reset, reset persistence, and focus-mode dialog behavior');

    await page.setViewportSize({ width: 390, height: 844 });
    await open();
    const bounds = await panel.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 391 && bounds.y >= 0 && bounds.height <= 845, 'Panel fits mobile viewport');
    await panel.getByRole('button', { name: 'Кобальт', exact: true }).click();
    await close();
    await setTheme('dark');
    await open();
    await panel.getByText('Настройки сохранены в вашем аккаунте', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'roadmap-table-appearance-mobile-dark.png'), fullPage: true });
    await close();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'Settings/table do not overflow mobile document');
    await waitFor(() => stored.get('appearance-alice')?.headerTint === '#2458b8', 'mobile setting saved');
    await page.evaluate(() => {
      localStorage.setItem('tracker.accessToken', 'appearance-bob');
      localStorage.setItem('tracker.sessionId', 'session-appearance-bob');
    });
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await appearance().getAttribute('data-header-tint'), 'false', 'Other account receives baseline, not the previous user colors');
    await open();
    await panel.getByRole('button', { name: 'Просторно', exact: true }).click();
    await waitFor(() => stored.get('appearance-bob')?.density === 'comfortable', 'other account saves its own preferences');
    assert.equal(stored.get('appearance-alice').density, 'standard', 'Other account changes do not overwrite original user');
    assert.equal(stored.get('appearance-alice').headerTint, '#2458b8');
    console.log('PASS mobile containment and account isolation');
    failReadFor.add('appearance-read-failure');
    const failedContext = await createContext('appearance-read-failure');
    const failedPage = await failedContext.newPage();
    await failedPage.goto(`${baseURL}/roadmap`, { waitUntil: 'networkidle' });
    await failedPage.getByRole('button', { name: 'Вид таблицы', exact: true }).click();
    const failedPanel = failedPage.getByRole('dialog', { name: 'Вид таблицы', exact: true });
    await failedPanel.getByRole('button', { name: 'Повторить', exact: true }).click();
    await failedPanel.getByText('Настройки сохранены в вашем аккаунте', { exact: true }).waitFor();
    assert.equal(await failedPanel.getByRole('button', { name: 'Компактно', exact: true }).isEnabled(), true, 'Initial read failure recovers through accessible retry');
    await failedContext.close();
    console.log('PASS initial preference read failure and retry');

    const navigationContext = await createContext('appearance-navigation');
    const navigationPage = await navigationContext.newPage();
    const navigationPanel = navigationPage.getByRole('dialog', { name: 'Вид таблицы', exact: true });
    await navigationPage.goto(`${baseURL}/roadmap`, { waitUntil: 'networkidle' });
    await navigationPage.getByRole('button', { name: 'Вид таблицы', exact: true }).click();
    await navigationPanel.getByRole('button', { name: 'Компактно', exact: true }).click();
    // Reload immediately, before the 450 ms autosave debounce can expire.
    await navigationPage.reload({ waitUntil: 'networkidle' });
    await waitFor(() => stored.get('appearance-navigation')?.density === 'compact', 'pending draft survives immediate document reload');
    assert.equal(await navigationPage.locator('.roadmap-table-appearance').first().getAttribute('data-density'), 'compact');
    await navigationPage.getByRole('button', { name: 'Вид таблицы', exact: true }).click();
    await navigationPanel.getByRole('button', { name: 'Бирюза', exact: true }).click();
    await navigationPanel.getByRole('button', { name: 'Закрыть настройки таблицы' }).click();
    await navigationPage.getByRole('link', { name: 'Аналитика', exact: true }).click();
    await navigationPage.waitForURL('**/roadmap/analytics');
    await waitFor(() => stored.get('appearance-navigation')?.headerTint === '#0f766e', 'unmount flush preserves last edit during quick navigation');
    await navigationPage.goto(`${baseURL}/roadmap`, { waitUntil: 'networkidle' });
    assert.equal(await navigationPage.locator('.roadmap-table-appearance').first().getAttribute('data-header-tint'), 'true');
    console.log('PASS rapid reload and immediate navigation before the debounce');

    await navigationPage.getByRole('button', { name: 'Вид таблицы', exact: true }).click();
    failNextSave = true;
    await navigationPanel.getByRole('button', { name: 'Просторно', exact: true }).click();
    await navigationPanel.getByText('Не удалось сохранить настройки.', { exact: true }).waitFor();
    failReadFor.add('appearance-navigation');
    // Preserve the failed draft, then also fail the next GET on recovery.
    await navigationPage.reload({ waitUntil: 'networkidle' });
    await navigationPage.getByRole('button', { name: 'Вид таблицы', exact: true }).click();
    await navigationPanel.getByRole('button', { name: 'Повторить', exact: true }).click();
    await waitFor(() => stored.get('appearance-navigation')?.density === 'comfortable', 'retry reloads account data and saves the preserved pending draft');
    assert.equal(await navigationPanel.getByRole('button', { name: 'Просторно', exact: true }).getAttribute('aria-pressed'), 'true', 'Successful recovery restores the pending preview');
    await navigationPanel.getByText('Настройки сохранены в вашем аккаунте', { exact: true }).waitFor();
    await navigationContext.close();
    console.log('PASS pending draft recovery combined with failed GET and retry');

    stored.set('appearance-tab-alice', { ...defaults, headerTint: '#903f65', epicTint: '#903f65', columnWidths: { name: 620 } });
    const tabsContext = await createContext('appearance-tab-alice');
    const oldPage = await tabsContext.newPage();
    await oldPage.goto(`${baseURL}/roadmap`, { waitUntil: 'networkidle' });
    const loginPage = await tabsContext.newPage();
    await loginPage.goto(`${baseURL}/roadmap`, { waitUntil: 'networkidle' });
    await oldPage.bringToFront();
    await oldPage.getByRole('button', { name: 'Вид таблицы', exact: true }).click();
    const oldPanel = oldPage.getByRole('dialog', { name: 'Вид таблицы', exact: true });
    await oldPanel.getByRole('button', { name: 'Кобальт', exact: true }).click();
    // Another tab replaces the credentials while Alice still has a pending edit.
    await loginPage.evaluate(() => {
      localStorage.setItem('tracker.accessToken', 'appearance-tab-bob');
      localStorage.setItem('tracker.sessionId', 'session-appearance-tab-bob');
    });
    await loginPage.reload({ waitUntil: 'networkidle' });
    await oldPage.bringToFront();
    const oldDensityControl = oldPanel.getByRole('button', { name: 'Компактно', exact: true });
    if (await oldDensityControl.isVisible() && await oldDensityControl.isEnabled()) await oldDensityControl.click();
    await sleep(1000);
    const bobWrites = writes.filter((write) => write.userId === 'appearance-tab-bob');
    assert.ok(bobWrites.every((write) => write.preferences.headerTint === null && Object.keys(write.preferences.columnWidths).length === 0), 'Old tab never writes Alice colors or widths using Bob credentials');
    await oldPage.reload({ waitUntil: 'networkidle' });
    assert.equal(await oldPage.locator('.roadmap-table-appearance').first().getAttribute('data-header-tint'), 'false', 'New session does not restore Alice pending draft');
    assert.equal(stored.get('appearance-tab-bob')?.headerTint ?? null, null);
    await tabsContext.close();
    console.log('PASS cross-tab login change while an old-page edit is pending');
    assert.deepEqual(unexpected, [], 'All network requests used fixtures');
    assert.deepEqual(browserErrors, [], 'No uncaught browser exceptions');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });



