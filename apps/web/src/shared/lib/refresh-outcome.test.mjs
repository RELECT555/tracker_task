import assert from 'node:assert/strict';
import test from 'node:test';
import { refreshOutcomeForStatus } from './refresh-outcome.ts';

test('a refused refresh token ends the session', () => {
  for (const status of [400, 401, 403]) assert.equal(refreshOutcomeForStatus(status), 'rejected');
});

test('server and network trouble keeps the user signed in', () => {
  for (const status of [404, 408, 429, 500, 502, 503, 504]) assert.equal(refreshOutcomeForStatus(status), 'unavailable');
});
