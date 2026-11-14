const fallbackMessage = 'Попробуйте ещё раз. Если ошибка повторится, обратитесь к администратору.';

/** Keep transport diagnostics out of the UI while preserving actionable business errors. */
export function getErrorMessage(error: unknown): string {
  const message = (error instanceof Error ? error.message : typeof error === 'string' ? error : '').trim();
  const status = error && typeof error === 'object' && 'status' in error && typeof error.status === 'number'
    ? error.status
    : Number(message.match(/^Request failed:\s*(\d{3})$/i)?.[1]) || undefined;

  if (status === 408 || status === 504 || /timeout|timed out/i.test(message)) return 'Сервер не успел ответить. Попробуйте ещё раз.';
  if (status && status >= 500) return 'Сервис временно недоступен. Попробуйте ещё раз чуть позже.';
  if (status === 401) return 'Сессия истекла. Войдите в аккаунт снова.';
  if (status === 403) return 'Недостаточно прав для этого действия. Обратитесь к администратору.';
  if (status === 404) return 'Данные не найдены. Возможно, они были удалены или перемещены.';
  if (status === 429) return 'Слишком много запросов. Подождите немного и попробуйте снова.';
  if (/failed to fetch|fetch failed|network\s?error|network request failed|load failed/i.test(message)) {
    return 'Не удалось связаться с сервером. Проверьте подключение к интернету и попробуйте снова.';
  }
  if (/^internal server error$|^service unavailable$|^bad gateway$/i.test(message)) {
    return 'Сервис временно недоступен. Попробуйте ещё раз чуть позже.';
  }
  if (!message || /^Request failed:|^Error\b|^<!doctype|^<html/i.test(message)) return fallbackMessage;
  return message;
}

export function getUniqueErrorMessages(errors: readonly unknown[]): string[] {
  const messages = new Map<string, string>();
  for (const error of errors) {
    if (!error) continue;
    const message = getErrorMessage(error);
    const key = message.toLocaleLowerCase('ru-RU').replace(/\s+/g, ' ').replace(/[.!\s]+$/, '');
    if (!messages.has(key)) messages.set(key, message);
  }
  return [...messages.values()];
}
