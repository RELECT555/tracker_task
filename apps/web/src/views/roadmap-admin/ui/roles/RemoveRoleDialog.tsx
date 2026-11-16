import { useEffect, useId, useRef } from 'react';
import { Button } from '@/shared/ui/button';
import { ErrorNotice } from '@/shared/ui/error-notice';

type RemoveRoleDialogProps = {
  roleName: string;
  /** Omit to delete the role from the shared catalog instead of removing it from a project. */
  projectName?: string;
  pending: boolean;
  error: Error | null;
  onClose: () => void;
  onRemove: () => void;
};

export function RemoveRoleDialog({ roleName, projectName, pending, error, onClose, onRemove }: RemoveRoleDialogProps) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const fromCatalog = projectName === undefined;

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    cancelButton.current?.focus();
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      aria-busy={pending}
      onCancel={(event) => { if (pending) event.preventDefault(); }}
      onClose={onClose}
      className="roadmap-dialog m-auto w-[min(28rem,calc(100%-2rem))] rounded-xl border border-border bg-card p-5 text-foreground shadow-xl backdrop:bg-black/50"
    >
      <h2 id={`${id}-title`} className="text-base font-semibold">{fromCatalog ? 'Удалить роль из каталога?' : 'Убрать роль из проекта?'}</h2>
      <p id={`${id}-description`} className="mt-2 wrap-anywhere text-sm leading-relaxed text-muted-foreground">
        {fromCatalog
          ? `Роль «${roleName}» исчезнет из каталога. В проектах, где она уже добавлена, она останется.`
          : `Роль «${roleName}» и её участники будут убраны из проекта «${projectName}».`}
      </p>
      {error && <ErrorNotice title={fromCatalog ? 'Не удалось удалить роль' : 'Не удалось убрать роль'} errors={[error]} className="mt-4" />}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button ref={cancelButton} type="button" variant="outline" disabled={pending} onClick={() => dialog.current?.close()}>Отмена</Button>
        <Button type="button" variant="destructive" disabled={pending} onClick={onRemove}>{fromCatalog ? (pending ? 'Удаляем…' : 'Удалить роль') : (pending ? 'Убираем…' : 'Убрать роль')}</Button>
      </div>
    </dialog>
  );
}
