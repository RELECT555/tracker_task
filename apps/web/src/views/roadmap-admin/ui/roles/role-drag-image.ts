export function setRoleDragImage(transfer: DataTransfer, source: HTMLElement, role: { name: string; color: string }) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return;

  const theme = getComputedStyle(source);
  context.font = `600 14px ${theme.fontFamily}`;
  canvas.width = Math.min(320, Math.ceil(context.measureText(role.name).width) + 48);
  canvas.height = 48;
  context.font = `600 14px ${theme.fontFamily}`;

  context.beginPath();
  context.roundRect(1, 1, canvas.width - 2, canvas.height - 2, 9);
  context.fillStyle = `hsl(${theme.getPropertyValue('--card')})`;
  context.fill();
  context.strokeStyle = `hsl(${theme.getPropertyValue('--primary')})`;
  context.lineWidth = 2;
  context.stroke();

  context.beginPath();
  context.arc(21, 24, 5, 0, 2 * Math.PI);
  context.fillStyle = role.color;
  context.fill();

  context.fillStyle = theme.color;
  context.textBaseline = 'middle';
  const textWidth = canvas.width - 48;
  let label = role.name;
  if (context.measureText(label).width > textWidth) {
    const characters = [...label];
    do {
      characters.pop();
      label = `${characters.join('')}…`;
    } while (context.measureText(label).width > textWidth && characters.length);
  }
  context.fillText(label, 36, 24);
  transfer.setDragImage(canvas, 20, 24);
}
