import {
  evaluateWriteRules,
  migrateWriteBackSettingsV1,
  renderSyncTags,
  renderSyncTemplate,
  type TemplateContext,
} from '@tracker/shared';

const context: TemplateContext & { estimate: number; remaining: number; assignee: string } = {
  role: 'Backend', title: 'Заявки', quarterKey: '2026-Q4', person: 'Иван Петров', personEmail: 'ivan@example.test', id: '42', estimate: 40, remaining: 24, assignee: 'ivan@example.test',
};

describe('roadmap sync shared settings', () => {
  it('migrates v1 fields to equivalent v2 rules', () => {
    const settings = migrateWriteBackSettingsV1({ fields: { assignedTo: true, originalEstimate: true, remainingWork: true, iteration: true, areaPath: true, description: true } });
    expect(settings.version).toBe(2);
    expect(settings.writeRules.map((rule) => rule.targetField)).toEqual(expect.arrayContaining([
      'System.AssignedTo', 'Microsoft.VSTS.Scheduling.OriginalEstimate', 'Microsoft.VSTS.Scheduling.RemainingWork', 'System.IterationPath', 'System.AreaPath', 'System.Description',
    ]));
    const values = evaluateWriteRules(settings.writeRules, context, new Map(settings.writeRules.map((rule) => [rule.targetField, { referenceName: rule.targetField }]))).values;
    expect(values['System.AssignedTo']).toBe('ivan@example.test');
    expect(values['Microsoft.VSTS.Scheduling.OriginalEstimate']).toBe(40);
    expect(values['Microsoft.VSTS.Scheduling.RemainingWork']).toBe(24);
  });

  it('renders tokens, semicolon-safe tags, and keeps unknown tokens', () => {
    expect(renderSyncTemplate('{role} {personEmail} {field:Custom.Team} {unknown}', { ...context, fields: { 'Custom.Team': 'Platform' } })).toBe('Backend ivan@example.test Platform {unknown}');
    expect(renderSyncTags('Roadmap; {role}; {title}', { ...context, title: 'A; B' })).toBe('Roadmap; Backend; A, B');
  });

  it('evaluates constants, roadmap values, by-role fallback, and picklists', () => {
    const result = evaluateWriteRules([
      { id: 'a', targetField: 'Custom.Activity', source: { kind: 'constant', value: 'Development' }, apply: 'always', enabled: true },
      { id: 'b', targetField: 'Custom.Hours', source: { kind: 'roadmap', value: 'estimate' }, apply: 'create', enabled: true },
      { id: 'c', targetField: 'Custom.RoleValue', source: { kind: 'byRole', values: { QA: 'Testing' }, fallback: 'Development' }, apply: 'always', enabled: true },
    ], context, new Map([
      ['Custom.Activity', { referenceName: 'Custom.Activity', isPicklist: true, allowedValues: ['Development', 'Testing'] }],
      ['Custom.Hours', { referenceName: 'Custom.Hours' }],
      ['Custom.RoleValue', { referenceName: 'Custom.RoleValue' }],
    ]));
    expect(result.values).toEqual({ 'Custom.Activity': 'Development', 'Custom.Hours': 40, 'Custom.RoleValue': 'Development' });
    expect(result.warnings).toEqual([]);
  });
});
