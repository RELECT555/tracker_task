import { redactSecrets } from './roadmap-alert-format';

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
