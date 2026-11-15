// Превью собирается из DOM, а не из canvas: Chrome не показывает отсоединённый canvas как drag image.
// Элемент на мгновение вставляется за пределами экрана — браузер снимает его в момент setDragImage.
export function setRoleDragImage(transfer: DataTransfer, source: HTMLElement, role: { name: string; color: string }) {
  const theme = getComputedStyle(source);
  const shadowSpace = 12;

  const frame = document.createElement('div');
  Object.assign(frame.style, {
    position: 'fixed',
    top: '-1000px',
    left: '-1000px',
    padding: `${shadowSpace}px`,
    pointerEvents: 'none',
    fontFamily: theme.fontFamily,
  });

  const card = document.createElement('div');
  Object.assign(card.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    maxWidth: '300px',
    padding: '8px 12px 8px 8px',
    borderRadius: '10px',
    border: '1.5px solid hsl(var(--primary))',
    background: 'hsl(var(--card))',
    color: 'hsl(var(--foreground))',
    boxShadow: `0 8px 20px -6px rgb(0 0 0 / 0.45), 0 0 0 4px color-mix(in srgb, ${role.color} 18%, transparent)`,
    fontSize: '14px',
    fontWeight: '600',
    lineHeight: '20px',
  });

  const mark = source.querySelector<HTMLElement>('[style*="background"]')?.cloneNode(true) as HTMLElement | undefined;
  if (mark) card.append(mark);

  const label = document.createElement('span');
  label.textContent = role.name;
  Object.assign(label.style, { minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
  card.append(label);

  const hint = document.createElement('span');
  hint.textContent = '+ в проект';
  Object.assign(hint.style, {
    flexShrink: '0',
    padding: '2px 8px',
    borderRadius: '999px',
    background: 'hsl(var(--primary) / 0.15)',
    color: 'hsl(var(--primary))',
    fontSize: '12px',
    fontWeight: '500',
  });
  card.append(hint);

  frame.append(card);
  document.body.append(frame);
  transfer.setDragImage(frame, shadowSpace + 22, shadowSpace + 22);
  requestAnimationFrame(() => frame.remove());
}
