/* Run against a running web dev server with Playwright available on NODE_PATH.
 * API responses are isolated fixtures: this script never changes server data.
 * node scripts/test-roadmap-column-widths.cjs
 */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const baseURL = process.env.ROADMAP_TEST_URL || 'http://localhost:3000';
const now = new Date();
const quarterKey = `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`;
const role = { id: 'resize-role', name: 'Разработка', color: '#3b82f6', members: [{ personExternalId: 'resize-person', personName: 'Тестовый участник', personEmail: 'resize@example.test', personIsActive: true }] };
const role2 = { id: 'resize-role-2', name: 'Тестирование', color: '#10b981', members: [] };
const user = (id) => ({ id, email: `${id}@example.test`, fullName: id, roles: ['admin'], orgUnit: null, manager: null });
const item = (id, type, parentExternalId = null, allocations = []) => ({
  id, externalId: id, parentExternalId, type, title: `${type} ${id}`, state: 'Active', url: null,
  actualHours: 8, azureCustomFields: type === 'Task' ? { 'System.AssignedTo': { id: 'resize-person', displayName: 'Тестовый участник', uniqueName: 'resize@example.test' } } : null, allocations,
});
const allocation = {
  id: 'resize-allocation', roleId: role.id, personExternalId: 'resize-person', personName: 'Тестовый участник',
  personEmail: null, quarterKey, estimatedHours: 40, actualHours: 8, role, periods: [], azureTaskId: 'task', azureSyncStatus: 'synced',
};
const plan = {
  id: 'resize-project', externalId: 'resize-project', name: 'Проверка ширины', url: null, syncedAt: null,
  roles: [role], azure: { writeBackEnabled: false },
  workItems: [item('epic', 'Epic'), item('feature', 'Feature', 'epic', [allocation, { ...allocation, id: 'resize-allocation-2', roleId: role2.id, role: role2, estimatedHours: 16, azureTaskId: null }]), item('task', 'Task', 'feature')],
};

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    let accountId = 'resize-user-a';
    const unexpectedRequests = [];
    await context.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
      const data = path === '/auth/me' ? { user: user(accountId) }
        : path === '/roadmap/connection' ? { provider: 'azure-devops', configured: true, organizationUrl: '' }
          : path === '/roadmap/projects' ? { data: [{ id: plan.externalId, name: plan.name, imported: true, planSynced: true, roadmapId: plan.id }] }
            : path === '/roadmap/people' ? { data: [] }
              : path === '/roadmap/admin/role-catalog' ? []
                : path === `/roadmap/projects/${plan.id}/plan` ? plan
                  : undefined;
      if (data === undefined) unexpectedRequests.push(path);
      await route.fulfill({ status: data === undefined ? 404 : 200, contentType: 'application/json', body: JSON.stringify(data ?? { message: 'Unexpected fixture request' }) });
    });
    await context.addInitScript(() => {
      localStorage.setItem('tracker.accessToken', 'isolated-browser-fixture');
      localStorage.setItem('tracker.sessionId', 'isolated-browser-session');
      window.__widthWrites = [];
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key.includes('column-width') || key.includes('column-widths')) window.__widthWrites.push({ key, value });
        return setItem.call(this, key, value);
      };
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${baseURL}/roadmap`, { waitUntil: 'networkidle' });
    await page.locator('table').waitFor({ timeout: 30000 });
    assert.deepEqual(unexpectedRequests, [], 'All API requests must use the expected isolated fixtures');
    console.log('Loaded fixture table', await page.locator('table th[scope="col"]').count(), 'columns');
    const getWidths = () => page.locator('table col').evaluateAll((cols) => Object.fromEntries(cols.map((col) => [col.dataset.columnId, col.getBoundingClientRect().width])));
    const getHandle = (id) => page.locator(`[role="separator"][data-column-id="${id}"]`);
    const settlePaint = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const assertClose = (actual, expected, description) => assert.ok(Math.abs(actual - expected) <= 1, `${description}: expected ${expected}, got ${actual}`);
    const getTableSize = () => page.locator('table').evaluate((table) => ({
      table: table.getBoundingClientRect().width,
      available: table.parentElement.clientWidth,
    }));
    const refreshPlan = async () => {
      const response = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith(`/roadmap/projects/${plan.id}/plan`));
      await page.evaluate(() => {
        // Queries cache data for 30 seconds; advance only this isolated page's clock.
        window.__realDateNow ??= Date.now;
        window.__testClockOffset = (window.__testClockOffset ?? 0) + 31_000;
        Date.now = () => window.__realDateNow() + window.__testClockOffset;
        window.dispatchEvent(new Event('visibilitychange'));
      });
      await response;
      await settlePaint();
    };
    const fitSize = await getTableSize();
    const resetWidthButton = page.getByRole('button', { name: 'Сбросить ширину', exact: true });
    assert.equal(await resetWidthButton.count(), 0, 'Default column widths do not show a reset button');
    assertClose(fitSize.table, fitSize.available, 'A project with one visible role fills its card by default');
    const fitWidths = await getWidths();
    assert.equal(Object.keys(fitWidths).length, 6, 'One role has adjacent plan, fact, and delta columns');
    assertClose(fitWidths['summary:plan'], 120, 'The plan total stays compact');
    assertClose(fitWidths['summary:fact'], 120, 'The actual total stays compact');
    assert.ok(fitWidths.name > 440 && fitWidths[`plan:${role.id}`] > 200, 'The title and role share available space');
    await page.setViewportSize({ width: 1850, height: 1000 });
    await settlePaint();
    const wideSize = await getTableSize();
    assertClose(wideSize.table, wideSize.available, 'Automatic layout adapts to a larger viewport');
    await page.setViewportSize({ width: 1600, height: 1000 });
    const collapseSidebar = page.getByRole('button', { name: 'Свернуть боковую панель', exact: true });
    const expandSidebar = page.getByRole('button', { name: 'Развернуть боковую панель', exact: true });
    await collapseSidebar.click();
    await settlePaint();
    const collapsedSidebarSize = await getTableSize();
    assert.ok(collapsedSidebarSize.available > fitSize.available, 'Collapsing the sidebar gives the plan more space');
    assertClose(collapsedSidebarSize.table, collapsedSidebarSize.available, 'One-role layout fills the card with a collapsed sidebar');
    await page.reload({ waitUntil: 'networkidle' });
    await expandSidebar.waitFor();
    const collapsedReloadSize = await getTableSize();
    assertClose(collapsedReloadSize.table, collapsedReloadSize.available, 'Reload fits the previously collapsed sidebar');
    const togglePlan = page.getByRole('button', { name: 'Детализация по ролям', exact: true });
    await togglePlan.click();
    const totalsSize = await getTableSize();
    assertClose(totalsSize.table, totalsSize.available, 'Totals-only view fills the card with a collapsed sidebar');
    await togglePlan.click();
    if (process.env.ROADMAP_TEST_SCREENSHOT) await page.screenshot({ path: process.env.ROADMAP_TEST_SCREENSHOT, fullPage: true });
    await getHandle('name').focus();
    await page.keyboard.press('Home');
    await resetWidthButton.waitFor({ state: 'visible' });
    const customTitleWidth = (await getWidths()).name;
    await expandSidebar.click();
    await collapseSidebar.click();
    await settlePaint();
    assertClose((await getWidths()).name, customTitleWidth, 'Collapsing the sidebar preserves the saved title width');
    const collapsedCustomSize = await getTableSize();
    assertClose(collapsedCustomSize.table, collapsedCustomSize.available, 'The automatic role column fills the room left by a customized title');
    await resetWidthButton.click();
    await resetWidthButton.waitFor({ state: 'detached' });
    await expandSidebar.click();
    await getHandle(`plan:${role.id}`).focus();
    await page.keyboard.press('ArrowLeft');
    const manualWidths = await getWidths();
    assertClose(manualWidths[`plan:${role.id}`], fitWidths[`plan:${role.id}`] - 16, 'Manual resizing uses the fitted width');
    assertClose(manualWidths.name, fitWidths.name, 'Manual resizing keeps the other fitted column in place');
    await page.reload({ waitUntil: 'networkidle' });
    assertClose((await getWidths())[`plan:${role.id}`], manualWidths[`plan:${role.id}`], 'Reload restores the exact manual width');
    const reloadSize = await getTableSize();
    assertClose(reloadSize.table, reloadSize.available, 'An automatic column fills the card around a saved width');
    await page.getByRole('button', { name: 'Сбросить ширину', exact: true }).click();
    for (const [id, width] of Object.entries(fitWidths)) assertClose((await getWidths())[id], width, `${id} returns to its adaptive default`);
    plan.roles.push(role2);
    plan.workItems.filter((entry) => entry.type !== 'Task').forEach((entry) => { entry.actualHours = 20; });
    await refreshPlan();
    console.log('PASS single-role layout fills the card, respects manual widths, and resets to automatic fitting');

    const revealFacts = async () => {
      const toggle = page.getByRole('button', { name: 'Детализация по ролям', exact: true });
      if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
    };
    await revealFacts();
    const initialWidths = await getWidths();
    assert.equal(Object.keys(initialWidths).length, 10, 'Fixture covers name, both summaries, two role triples, and unattributed fact');
    assert.equal(await page.getByRole('separator').count(), 10, 'Every visible column has a resize handle');
    for (const id of Object.keys(initialWidths)) {
      const handle = getHandle(id);
      await handle.scrollIntoViewIfNeeded();
      const bounds = await handle.boundingBox();
      const header = await handle.evaluate((element) => {
        const rect = element.closest('th').getBoundingClientRect();
        return { right: rect.right, width: rect.width };
      });
      assertClose(bounds.x + bounds.width, header.right, `${id} handle aligned with header border`);
      const before = await getWidths();
      await page.evaluate(() => { window.__widthWrites = []; });
      const x = bounds.x + bounds.width / 2;
      const y = bounds.y + bounds.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 48, y, { steps: 6 });
      await settlePaint();
      const preview = await getWidths();
      assertClose(preview[id], before[id] + 48, `${id} preview follows pointer exactly`);
      for (const other of Object.keys(before).filter((key) => key !== id)) assertClose(preview[other], before[other], `${id} leaves ${other} unchanged`);
      assert.equal(await page.evaluate(() => window.__widthWrites.length), 0, `${id} does not persist during drag`);
      await page.mouse.up();
      await settlePaint();
      const committed = await getWidths();
      assertClose(committed[id], preview[id], `${id} does not jump on release`);
      assert.equal(await page.evaluate(() => window.__widthWrites.length), 1, `${id} persists once on release`);
    }
    console.log('PASS all ten columns: exact dragging, stable neighbors, aligned handles, one storage write per drag');

    const lastHandle = getHandle('fact:unattributed');
    await page.locator('table').evaluate((table) => { table.parentElement.scrollLeft = table.parentElement.scrollWidth; });
    const lastBounds = await lastHandle.boundingBox();
    const lastStart = await page.locator('table').evaluate((table) => ({ scroll: table.parentElement.scrollLeft, firstX: table.querySelector('col').getBoundingClientRect().x }));
    await page.mouse.move(lastBounds.x + lastBounds.width / 2, lastBounds.y + lastBounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(lastBounds.x + lastBounds.width / 2 - 48, lastBounds.y + lastBounds.height / 2, { steps: 4 });
    await settlePaint();
    const lastEnd = await page.locator('table').evaluate((table) => ({ scroll: table.parentElement.scrollLeft, firstX: table.querySelector('col').getBoundingClientRect().x }));
    const lastEndBounds = await lastHandle.boundingBox();
    await page.mouse.up();
    await settlePaint();
    const lastReleased = await page.locator('table').evaluate((table) => ({ scroll: table.parentElement.scrollLeft, firstX: table.querySelector('col').getBoundingClientRect().x }));
    const lastReleasedBounds = await lastHandle.boundingBox();

    const movingRole = getHandle(`plan:${role.id}`);
    await movingRole.scrollIntoViewIfNeeded();
    const movingBounds = await movingRole.boundingBox();
    const beforeReorder = await getWidths();
    const movingX = movingBounds.x + movingBounds.width / 2;
    const movingY = movingBounds.y + movingBounds.height / 2;
    await page.evaluate(() => { window.__widthWrites = []; });
    await page.mouse.move(movingX, movingY);
    await page.mouse.down();
    await page.mouse.move(movingX + 20, movingY);
    plan.roles.reverse();
    await refreshPlan();
    await page.mouse.move(movingX + 40, movingY);
    await page.mouse.up();
    for (const [id, width] of Object.entries(beforeReorder)) assertClose((await getWidths())[id], width, `${id} remains committed after a structural refresh cancels the drag`);
    assert.equal(await page.evaluate(() => window.__widthWrites.length), 0, 'Cancelled drag during role reorder does not persist');
    assert.deepEqual(await page.evaluate(() => ({ cursor: document.body.style.cursor, select: document.body.style.userSelect })), { cursor: '', select: '' }, 'Role reorder cleans up drag state');
    assert.equal(await movingRole.getAttribute('data-resizing'), null, 'Role reorder clears active handle state');
    await movingRole.scrollIntoViewIfNeeded();
    const retryBounds = await movingRole.boundingBox();
    const retryX = retryBounds.x + retryBounds.width / 2;
    const retryY = retryBounds.y + retryBounds.height / 2;
    await page.mouse.move(retryX, retryY);
    await page.mouse.down();
    await page.mouse.move(retryX + 40, retryY);
    await page.mouse.up();
    assertClose((await getWidths())[`plan:${role.id}`], beforeReorder[`plan:${role.id}`] + 40, 'Fresh resize after structural refresh updates the intended role');
    assertClose((await getWidths())[`plan:${role2.id}`], beforeReorder[`plan:${role2.id}`], 'Fresh resize after structural refresh leaves the other role unchanged');
    plan.roles.reverse();
    await refreshPlan();
    console.log('PASS role reorder safely cancels drag and the next resize uses the correct column');
    assertClose(lastEnd.scroll, lastStart.scroll, 'Shrinking the last column keeps horizontal scrolling stable');
    assertClose(lastEnd.firstX, lastStart.firstX, 'Shrinking the last column keeps neighboring columns stationary');
    assertClose(lastEndBounds.x - lastBounds.x, -48, 'Last-column handle follows the pointer while shrinking');
    assertClose(lastReleased.scroll, lastStart.scroll, 'Release keeps horizontal scrolling stable');
    assertClose(lastReleased.firstX, lastStart.firstX, 'Release keeps neighboring columns stationary');
    assertClose(lastReleasedBounds.x - lastBounds.x, -48, 'Last-column handle does not jump on release');
    console.log('PASS shrinking the last column at the scroll limit stays stable through release');

    const nameHandle = getHandle('name');
    await nameHandle.scrollIntoViewIfNeeded();
    const nameBeforeKeyboard = (await getWidths()).name;
    await nameHandle.focus();
    await page.keyboard.press('ArrowRight');
    assertClose((await getWidths()).name, nameBeforeKeyboard + 16, 'Keyboard arrow resizing');
    await page.keyboard.press('Home');
    assertClose((await getWidths()).name, 280, 'Home reaches minimum width');
    const nameMaximum = Number(await nameHandle.getAttribute('aria-valuemax'));
    await page.keyboard.press('End');
    assertClose((await getWidths()).name, nameMaximum, 'End reaches maximum width');
    await page.keyboard.press('ArrowRight');
    assertClose((await getWidths()).name, nameMaximum, 'Maximum width is enforced');
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowLeft');
    assertClose((await getWidths()).name, 280, 'Minimum width is enforced');
    console.log('PASS keyboard resizing and bounds');

    await nameHandle.scrollIntoViewIfNeeded();
    const finalBounds = await nameHandle.boundingBox();
    const finalX = finalBounds.x + finalBounds.width / 2;
    const finalY = finalBounds.y + finalBounds.height / 2;
    await page.mouse.move(finalX, finalY);
    await page.mouse.down();
    await page.mouse.move(finalX + 30, finalY);
    await nameHandle.dispatchEvent('pointerup', { pointerId: 1, clientX: finalX + 47, clientY: finalY, button: 0, isPrimary: true });
    await page.mouse.up();
    assertClose((await getWidths()).name, 327, 'Final pointerup coordinate is retained');
    console.log('PASS final pointerup coordinate is retained');

    await nameHandle.focus();
    const cancelBounds = await nameHandle.boundingBox();
    const cancelX = cancelBounds.x + cancelBounds.width / 2;
    const cancelY = cancelBounds.y + cancelBounds.height / 2;
    await page.evaluate(() => { window.__widthWrites = []; });
    await page.mouse.move(cancelX, cancelY);
    await page.mouse.down();
    await page.mouse.move(cancelX + 50, cancelY);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    assertClose((await getWidths()).name, 327, 'Escape restores width');
    assert.equal(await page.evaluate(() => window.__widthWrites.length), 0, 'Cancelled resize does not persist');
    assert.deepEqual(await page.evaluate(() => ({ cursor: document.body.style.cursor, select: document.body.style.userSelect })), { cursor: '', select: '' }, 'Drag styles are cleaned up');
    console.log('PASS cancelled resize restores width and cleans up drag state');

    const savedA = await getWidths();
    await page.reload({ waitUntil: 'networkidle' });
    await revealFacts();
    for (const [id, width] of Object.entries(savedA)) assertClose((await getWidths())[id], width, `${id} persists across reload`);
    accountId = 'resize-user-b';
    await page.reload({ waitUntil: 'networkidle' });
    await revealFacts();
    for (const [id, width] of Object.entries(initialWidths)) assertClose((await getWidths())[id], width, `${id} starts independently for another user`);
    await getHandle('name').focus();
    await page.keyboard.press('ArrowRight');
    assertClose((await getWidths()).name, initialWidths.name + 16, 'Second user can customize independently');
    accountId = 'resize-user-a';
    await page.reload({ waitUntil: 'networkidle' });
    await revealFacts();
    for (const [id, width] of Object.entries(savedA)) assertClose((await getWidths())[id], width, `${id} restores first user customization`);
    console.log('PASS reload persistence and isolation between two users in the same browser');

    await page.getByRole('button', { name: 'Детализация по ролям', exact: true }).click();
    const collapsedWidths = await getWidths();
    for (const [id, width] of Object.entries(collapsedWidths)) assertClose(width, savedA[id], `${id} stays fixed when role columns are hidden`);
    await page.getByRole('button', { name: 'Детализация по ролям', exact: true }).click();
    for (const [id, width] of Object.entries(savedA)) assertClose((await getWidths())[id], width, `${id} restores after role columns are shown`);
    console.log('PASS role collapse and expand preserve widths');

    await page.setViewportSize({ width: 390, height: 844 });
    await settlePaint();
    assert.equal(await page.getByRole('separator').count(), 10, 'Resizers remain available on narrow screens');
    for (const [id, width] of Object.entries(savedA)) assertClose((await getWidths())[id], width, `${id} stays fixed on mobile`);
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(horizontalOverflow, false, 'Table scrolling does not expand the page viewport');
    console.log('PASS narrow viewport keeps stable columns within table scrolling');

    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.locator('table').evaluate((table) => { table.parentElement.scrollLeft = 0; });
    await page.getByRole('button', { name: 'Сбросить ширину', exact: true }).click();
    for (const [id, width] of Object.entries(initialWidths)) assertClose((await getWidths())[id], width, `${id} reset restores default width`);
    await page.reload({ waitUntil: 'networkidle' });
    await revealFacts();
    for (const [id, width] of Object.entries(initialWidths)) assertClose((await getWidths())[id], width, `${id} reset survives reload`);
    accountId = 'resize-user-b';
    await page.reload({ waitUntil: 'networkidle' });
    assertClose((await getWidths()).name, initialWidths.name + 16, 'Reset does not affect another user');
    console.log('PASS reset persists and leaves another account unchanged');
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('PASS no uncaught browser errors');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
