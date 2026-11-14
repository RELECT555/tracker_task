import assert from 'node:assert/strict';
import test from 'node:test';
import { getErrorMessage, getUniqueErrorMessages } from './error-message.ts';

const apiError = (message, status) => Object.assign(new Error(message), { status });

test('simultaneous transport failures collapse into one readable explanation', () => {
  const messages = getUniqueErrorMessages([
    apiError('Internal Server Error', 500),
    apiError('Database connection details', 503),
    new Error('Request failed: 502'),
    null,
    undefined,
  ]);
  assert.equal(messages.length, 1);
  assert.match(messages[0], /Сервис временно недоступен/);
  assert.doesNotMatch(messages[0], /Database|Request failed|Internal Server Error/);
});

test('distinct actionable failures survive deduplication', () => {
  assert.deepEqual(getUniqueErrorMessages([
    apiError('В проекте уже есть такая роль.', 409),
    apiError('В проекте уже есть такая роль', 409),
    apiError('Укажите название роли.', 400),
  ]), ['В проекте уже есть такая роль.', 'Укажите название роли.']);
});

test('network, permissions, timeout and rate-limit errors explain recovery', () => {
  assert.match(getErrorMessage(new TypeError('Failed to fetch')), /подключение к интернету/);
  assert.match(getErrorMessage(apiError('Forbidden', 403)), /Недостаточно прав/);
  assert.match(getErrorMessage(apiError('Gateway Timeout', 504)), /Сервер не успел ответить/);
  assert.match(getErrorMessage(apiError('Too many requests', 429)), /Подождите/);
  assert.match(getErrorMessage(apiError('Unauthorized', 401)), /Войдите в аккаунт снова/);
});

test('empty or HTML responses do not leak transport output', () => {
  assert.match(getErrorMessage({}), /Попробуйте ещё раз/);
  assert.doesNotMatch(getErrorMessage('<!DOCTYPE html><html>proxy error</html>'), /html|proxy/);
  assert.deepEqual(getUniqueErrorMessages([null, undefined, false]), []);
});
