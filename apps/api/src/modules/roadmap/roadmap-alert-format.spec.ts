import {
  alertLink,
  formatAlert,
  pluralAssignments,
  redactSecrets,
} from './roadmap-alert-format';

describe('redactSecrets', () => {
  it('strips Basic and Bearer credentials', () => {
    const text = redactSecrets(
      'sent Basic dXNlcjpwYXNz and Bearer eyJhbGciOi.payload.sig to Azure',
      500,
    );
    expect(text).not.toContain('dXNlcjpwYXNz');
    expect(text).not.toContain('eyJhbGciOi');
    expect(text).toContain('to Azure');
  });

  it('strips bare 52 and 84 character tokens but keeps other words', () => {
    const pat52 = 'a1B2'.repeat(13);
    const pat84 = 'z9Y8'.repeat(21);
    const text = redactSecrets(
      `pat ${pat52} and ${pat84} and ${'k'.repeat(40)}`,
      500,
    );
    expect(text).not.toContain(pat52);
    expect(text).not.toContain(pat84);
    expect(text).toContain('k'.repeat(40));
  });

  it('strips everything after the webhook secret header', () => {
    const text = redactSecrets(
      'request failed, X-Roadmap-Webhook-Secret: s3cr3t-value trailing',
      500,
    );
    expect(text).not.toContain('s3cr3t-value');
    expect(text).not.toContain('trailing');
    expect(text).toContain('request failed');
  });

  it('truncates to the requested length after redaction', () => {
    expect(redactSecrets('y'.repeat(700), 500)).toHaveLength(500);
    expect(redactSecrets('short', 500)).toBe('short');
  });
});

describe('formatAlert', () => {
  it('names the failing assignments and the project', () => {
    expect(formatAlert('sync_errors', { count: 5 }, 'Alpha').title).toBe(
      'Ошибки отправки в Azure: 5 назначений · Alpha',
    );
  });

  it.each([
    [1, '1 назначение'],
    [2, '2 назначения'],
    [5, '5 назначений'],
    [11, '11 назначений'],
    [12, '12 назначений'],
    [21, '21 назначение'],
    [22, '22 назначения'],
  ])('declines the assignment count %i', (count, expected) => {
    expect(pluralAssignments(count)).toBe(expected);
    expect(formatAlert('sync_errors', { count }, 'Alpha').title).toContain(
      expected,
    );
  });

  it('reports conflicts and a silent webhook per project', () => {
    expect(formatAlert('sync_conflicts', { count: 2 }, 'Alpha').title).toBe(
      'Конфликты с Azure: 2 назначения · Alpha',
    );
    expect(formatAlert('webhook_silent', {}, 'Alpha').title).toBe(
      'Webhook из Azure не приходит · Alpha',
    );
  });

  it('reports a rejected PAT without a project', () => {
    const alert = formatAlert('azure_auth', { httpStatus: 401 }, null);
    expect(alert.title).toBe('Azure DevOps отклоняет PAT (HTTP 401)');
    expect(alert.body).toBeNull();
  });

  it('shows the import error without credentials', () => {
    const alert = formatAlert(
      'import_failing',
      { error: 'Bearer secrettoken boom' },
      'Beta',
    );
    expect(alert.title).toBe('Не удаётся обновить проект из Azure · Beta');
    expect(alert.body).toContain('boom');
    expect(alert.body).not.toContain('secrettoken');
  });

  it('keeps the body within 300 characters', () => {
    const alert = formatAlert(
      'import_failing',
      { error: 'x '.repeat(500) },
      'Beta',
    );
    expect(alert.body).toHaveLength(300);
  });

  it('has no body when there is no error text', () => {
    expect(formatAlert('import_failing', {}, 'Beta').body).toBeNull();
    expect(formatAlert('sync_errors', { count: 1 }, 'Beta').body).toBeNull();
  });
});

describe('alertLink', () => {
  it('sends project alerts about assignments and imports to the projects list', () => {
    for (const kind of [
      'sync_errors',
      'sync_conflicts',
      'import_failing',
    ] as const) {
      expect(alertLink(kind, 'p1')).toBe(
        '/roadmap/admin/integrations#azure-projects',
      );
    }
  });

  it('sends the PAT alert to the connection and webhook alerts to the webhook', () => {
    expect(alertLink('azure_auth', null)).toBe(
      '/roadmap/admin/integrations#azure-connection',
    );
    expect(alertLink('webhook_silent', 'p1')).toBe(
      '/roadmap/admin/integrations#azure-webhook',
    );
  });
});
