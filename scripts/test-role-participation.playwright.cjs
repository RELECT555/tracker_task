/* Run against a local web server using isolated API fixtures:
 * npx --package @playwright/cli playwright-cli -s=role-participation open http://localhost:3000 --browser chrome
 * npx --package @playwright/cli playwright-cli -s=role-participation run-code --filename scripts/test-role-participation.playwright.cjs
 * No real employee or project data is read or changed.
 */
async (page) => {
  const origin = 'http://localhost:3000';
  const report = [];
  const runtimeErrors = [];
  const unexpectedRequests = [];
  const writes = [];
  let failNextSave = false;
  const project = { id: 'participation-project', roadmapId: 'participation-project', name: 'Тестовый проект', imported: true, planSynced: true };
  const people = [
    { id: 'participation-ivan', name: 'Иван Петров', email: 'ivan@example.test', isActive: true },
    { id: 'participation-anna', name: 'Анна Смирнова', email: 'anna@example.test', isActive: true },
    { id: 'participation-alex', name: 'Александр Константинопольский', email: 'alexander.long.address@example.test', isActive: true },
    { id: 'participation-inactive', name: 'Неактивный сотрудник', email: null, isActive: false },
    { id: 'participation-other-inactive', name: 'Другой неактивный сотрудник', email: null, isActive: false },
  ];
  const member = (person, allocationPercent) => ({ personExternalId: person.id, personName: person.name, personEmail: person.email, personIsActive: person.isActive, allocationPercent });
  const role = {
    id: 'participation-role', name: 'Разработка', color: '#6366f1', projectId: project.id, projectName: project.name,
    defaultPersonExternalId: people[0].id, defaultPersonName: people[0].name,
    members: [member(people[0], undefined), member(people[1], undefined)],
  };
  const roles = [role];
  const fixtures = {
    '/auth/me': { user: { id: 'participation-admin', email: 'admin@example.test', fullName: 'Администратор', roles: ['admin'], orgUnit: null, manager: null } },
    '/roadmap/projects': { data: [project] },
    '/roadmap/admin/roles': roles,
    '/roadmap/admin/users': people,
    '/roadmap/admin/role-catalog': [],
  };
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await page.unroute('**/api/v1/**');
  await page.context().addInitScript(() => {
    localStorage.setItem('tracker.accessToken', 'isolated-participation-fixture');
    localStorage.setItem('tracker.sessionId', 'isolated-participation-session');
    localStorage.setItem('theme', 'light');
  });
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    const method = route.request().method();
    let response = fixtures[path];
    if (method !== 'GET') {
      const payload = route.request().postDataJSON();
      writes.push({ path, method, payload });
      if (path === `/roadmap/admin/roles/${role.id}` && method === 'PATCH') {
        if (failNextSave) {
          failNextSave = false;
          await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Не удалось сохранить тестовую роль' }) });
          return;
        }
        if (payload.name) role.name = payload.name;
        if (payload.color) role.color = payload.color;
        if (payload.memberAllocations) {
          role.members = payload.memberAllocations.map((entry) => member(people.find((person) => person.id === entry.personExternalId), entry.allocationPercent));
          role.defaultPersonExternalId = null;
          role.defaultPersonName = null;
        }
        response = role;
      } else if (path === '/roadmap/admin/role-catalog' && method === 'POST') {
        response = { ...payload, id: 'participation-created', members: (payload.memberAllocations ?? []).map((entry) => member(people.find((person) => person.id === entry.personExternalId), entry.allocationPercent)) };
        roles.push(response);
      } else {
        unexpectedRequests.push(`${method} ${path}`);
      }
    }
    if (response === undefined) {
      unexpectedRequests.push(`${method} ${path}`);
      await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
  });
  const openRole = async () => {
    await page.getByRole('button', { name: `Настроить роль «${role.name}»`, exact: true }).click();
    await editor().waitFor();
  };
  const editor = () => page.getByRole('dialog', { name: `Настроить роль «${role.name}»`, exact: true });
  const share = (person) => editor().getByRole('spinbutton', { name: `Участие: ${person.name}`, exact: true });
  const save = () => editor().getByRole('button', { name: 'Сохранить', exact: true });
  const changeMembers = async (person, checked) => {
    await editor().getByRole('button', { name: /Изменить состав|Добавить сотрудников/ }).click();
    const picker = page.getByRole('dialog', { name: 'Выбор сотрудников', exact: true });
    const checkbox = picker.getByRole('checkbox', { name: new RegExp(person.name) });
    await checkbox.setChecked(checked);
    await picker.getByRole('button', { name: 'Готово', exact: true }).click();
  };
  const shares = async (members) => Promise.all(members.map(async (person) => Number(await share(person).inputValue())));
  const checkShares = async (members, expected) => {
    const actual = await shares(members);
    assert(JSON.stringify(actual) === JSON.stringify(expected), `Expected shares ${expected}, received ${actual}`);
  };
  const noHorizontalOverflow = async () => {
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Page must not overflow horizontally');
    assert(await editor().evaluate((node) => node.scrollWidth <= node.clientWidth), 'Role dialog must not overflow horizontally');
    const bounds = await editor().boundingBox();
    const viewport = page.viewportSize();
    assert(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width, 'Role dialog must stay within the viewport');
  };

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${origin}/roadmap/admin/roles?projectId=${project.id}`);
  await openRole();
  assert(!/по умолчанию/i.test(await editor().innerText()), 'Default employee concept must not appear in role settings');
  await checkShares(people.slice(0, 2), [50, 50]);
  assert(await save().isDisabled(), 'Unchanged role must not save');
  await changeMembers(people[1], false);
  await checkShares([people[0]], [100]);
  await changeMembers(people[1], true);
  await checkShares(people.slice(0, 2), [50, 50]);
  await changeMembers(people[2], true);
  const thirds = await shares(people.slice(0, 3));
  assert(thirds.map((value) => Math.round(value * 100)).reduce((total, value) => total + value, 0) === 10000, 'Three rounded shares must total exactly 100%');
  assert(thirds.every((value) => value === 33.33 || value === 33.34), 'Three employees must receive equal shares to two decimal places');
  assert(writes.length === 0, 'Editing membership must not save before explicit confirmation');
  report.push('PASS: default-employee field removed; one employee 100%, two 50/50, three rounded shares total 100%; no autosave');

  await share(people[0]).fill('60');
  assert(await save().isDisabled(), 'Invalid sum must prevent saving');
  await share(people[1]).fill('30');
  await share(people[2]).fill('10');
  assert(await save().isEnabled(), 'Valid custom shares must allow saving');
  await noHorizontalOverflow();
  await page.screenshot({ path: 'output/playwright/role-participation-desktop.png', animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await noHorizontalOverflow();
  await page.screenshot({ path: 'output/playwright/role-participation-mobile.png', animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  failNextSave = true;
  await save().click();
  await editor().getByRole('alert').waitFor();
  await checkShares(people.slice(0, 3), [60, 30, 10]);
  assert(await save().isEnabled(), 'Failed save must preserve editable shares and allow retry');
  await save().click();
  await editor().waitFor({ state: 'detached' });
  assert(JSON.stringify(writes.at(-1).payload.memberAllocations.map((entry) => entry.allocationPercent)) === '[60,30,10]', 'API save must include custom percentages');
  assert(!('personExternalId' in writes.at(-1).payload), 'New editor must not select a legacy default employee');
  await openRole();
  await checkShares(people.slice(0, 3), [60, 30, 10]);
  report.push('PASS: invalid sum blocks save; custom 60/30/10 saved and reopened; failed save preserves changes; desktop/mobile fit');

  await editor().getByRole('textbox', { name: 'Название роли', exact: true }).fill('Разработка команды');
  const renamedDialog = editor();
  await save().click();
  await renamedDialog.waitFor({ state: 'detached' });
  assert(!('memberAllocations' in writes.at(-1).payload), 'Renaming a role must not overwrite employee shares');
  await openRole();
  await checkShares(people.slice(0, 3), [60, 30, 10]);
  report.push('PASS: metadata-only save preserves custom shares without resubmitting members');

  await share(people[0]).fill('');
  assert(await save().isDisabled(), 'Empty percentage must not be saved');
  await share(people[0]).fill('-1');
  assert(await save().isDisabled(), 'Negative percentage must not be saved');
  await share(people[0]).fill('101');
  assert(await save().isDisabled(), 'Percentage above 100 must not be saved');
  await editor().getByRole('button', { name: 'Разделить поровну', exact: true }).click();
  assert((await shares(people.slice(0, 3))).every((value) => value === 33.33 || value === 33.34), 'Equalize button must reset all custom shares');
  await changeMembers(people[2], false);
  await checkShares(people.slice(0, 2), [50, 50]);
  await share(people[0]).fill('50.000000001');
  assert(await save().isDisabled(), 'Extra decimal precision must not be accepted even when rounded shares total 100');
  assert(await share(people[0]).getAttribute('aria-invalid') === 'true', 'Excess precision must mark the percentage field invalid');
  await share(people[0]).fill('50');
  assert(await save().isEnabled(), 'Correcting excess precision must restore saving');
  await share(people[0]).fill('0');
  await share(people[1]).fill('100');
  assert(await save().isEnabled(), 'Zero participation is valid when total remains 100');
  await editor().getByRole('button', { name: `Убрать из роли: ${people[1].name}`, exact: true }).click();
  await checkShares([people[0]], [100]);
  assert(await share(people[0]).evaluate((node) => node === document.activeElement), 'Removing a row must move keyboard focus to the remaining employee');
  await editor().getByRole('button', { name: 'Отмена', exact: true }).click();
  await editor().getByRole('button', { name: 'Не сохранять', exact: true }).click();
  await openRole();
  await checkShares(people.slice(0, 3), [60, 30, 10]);
  await changeMembers(people[0], false);
  await changeMembers(people[1], false);
  await changeMembers(people[2], false);
  assert(await editor().getByRole('spinbutton').count() === 0, 'Removing every employee must leave an empty role');
  assert(await save().isEnabled(), 'A role with no employees may be saved');
  await save().click();
  await editor().waitFor({ state: 'detached' });
  assert(writes.at(-1).payload.memberAllocations.length === 0, 'Removing every employee must send an explicit empty array');
  await openRole();
  assert(await editor().getByRole('spinbutton').count() === 0, 'Empty membership must remain empty after reopening');
  await editor().getByRole('button', { name: 'Отмена', exact: true }).click();
  report.push('PASS: empty/negative/over-100 shares rejected; equalize and removals rebalance; zero shares allowed; discard preserves saved data; empty roles persist');

  await page.getByRole('button', { name: 'Новая роль', exact: true }).click();
  const createDialog = page.getByRole('dialog', { name: 'Новая роль', exact: true });
  await createDialog.getByRole('textbox', { name: 'Название роли', exact: true }).fill('Новая тестовая роль');
  await createDialog.getByRole('button', { name: 'Добавить сотрудников', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Выбор сотрудников', exact: true });
  assert(await picker.getByRole('checkbox', { name: /Неактивный сотрудник/ }).count() === 0, 'Inactive employees must not be offered for new memberships');
  await picker.getByRole('checkbox', { name: new RegExp(people[0].name) }).check();
  await picker.getByRole('button', { name: 'Готово', exact: true }).click();
  assert(await createDialog.getByRole('spinbutton', { name: `Участие: ${people[0].name}`, exact: true }).inputValue() === '100', 'New single-member role must start at 100%');
  await createDialog.getByRole('button', { name: 'Создать роль', exact: true }).click();
  await createDialog.waitFor({ state: 'detached' });
  assert(writes.at(-1).payload.memberAllocations[0].allocationPercent === 100, 'Role creation must send employee participation');

  role.members = [member(people[0], 50), member(people[3], 50)];
  await page.reload();
  await openRole();
  await checkShares([people[0], people[3]], [50, 50]);
  await editor().getByRole('button', { name: 'Изменить состав', exact: true }).click();
  const existingPicker = page.getByRole('dialog', { name: 'Выбор сотрудников', exact: true });
  const existingInactive = existingPicker.getByRole('checkbox', { name: new RegExp(`^${people[3].name}`) });
  await existingInactive.uncheck();
  assert(await existingInactive.count() === 1 && !await existingInactive.isChecked(), 'Unchecking an existing inactive employee must keep them available in this edit');
  assert(await existingPicker.getByRole('checkbox', { name: new RegExp(people[4].name) }).count() === 0, 'Other inactive employees must remain unavailable');
  await existingInactive.check();
  await existingPicker.getByRole('button', { name: 'Готово', exact: true }).click();
  await checkShares([people[0], people[3]], [50, 50]);
  assert(await save().isDisabled(), 'Restoring the original inactive membership must leave the role unchanged');
  await editor().getByRole('button', { name: 'Отмена', exact: true }).click();
  report.push('PASS: 50.000000001/50 rejected; existing inactive employee can be unchecked and rechecked while other inactive employees stay excluded');
  assert(unexpectedRequests.length === 0, `Unexpected API requests: ${unexpectedRequests.join('; ')}`);
  assert(runtimeErrors.length === 0, `Unexpected browser errors: ${runtimeErrors.join('; ')}`);
  report.push('PASS: new role sends 100% participant, inactive staff excluded, no unexpected API requests or browser errors');
  return report;
}
