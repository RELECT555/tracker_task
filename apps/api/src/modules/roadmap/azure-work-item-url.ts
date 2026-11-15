// REST-адрес элемента: `{организация}[/{GUID проекта}]/_apis/wit/workItems/{id}`.
const REST_WORK_ITEM_URL =
  /^(https?:\/\/.+?)(?:\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?\/_apis\/wit\/workItems\/\d+\/?$/i;

/**
 * Превращает REST-адрес Azure DevOps (открывается как JSON) в ссылку на карточку
 * элемента в веб-интерфейсе. Возвращает null, если адрес не похож на REST
 * или проект неизвестен — тогда вызывающий оставляет исходное значение.
 */
export function azureWorkItemWebUrl(
  url: string | null | undefined,
  projectName: unknown,
  externalId: string | number,
) {
  if (!url || typeof projectName !== 'string' || !projectName.trim())
    return null;
  const match = REST_WORK_ITEM_URL.exec(url);
  if (!match) return null;
  return `${match[1]}/${encodeURIComponent(projectName.trim())}/_workitems/edit/${encodeURIComponent(String(externalId))}`;
}
