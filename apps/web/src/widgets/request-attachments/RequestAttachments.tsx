'use client';

import {
  File,
  FileImage,
  FileText,
  Paperclip,
  Trash2,
  Upload,
} from 'lucide-react';
import { useId, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';

const MAX_FILE_BYTES = 20 * 1024 * 1024;

export type LocalAttachment = {
  id: string;
  file: File;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function fileIcon(mimeType: string): ReactNode {
  if (mimeType.startsWith('image/')) {
    return <FileImage className="h-4 w-4" strokeWidth={1.75} />;
  }
  if (mimeType.includes('pdf') || mimeType.startsWith('text/')) {
    return <FileText className="h-4 w-4" strokeWidth={1.75} />;
  }
  return <File className="h-4 w-4" strokeWidth={1.75} />;
}

function createLocalId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function RequestAttachments({
  embedded = false,
  canUpload = true,
}: {
  embedded?: boolean;
  /** Пока без бэка — визуальное добавление доступно всем, кто видит карточку. */
  canUpload?: boolean;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<LocalAttachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addFiles = (incoming: FileList | File[]) => {
    const list = Array.from(incoming);
    if (list.length === 0) return;

    const oversized = list.find((file) => file.size > MAX_FILE_BYTES);
    if (oversized) {
      setError(`Файл «${oversized.name}» больше 20 МБ`);
      return;
    }

    setError(null);
    setFiles((current) => {
      const existingKeys = new Set(
        current.map((item) => `${item.file.name}:${item.file.size}:${item.file.lastModified}`),
      );
      const next = list
        .filter((file) => !existingKeys.has(`${file.name}:${file.size}:${file.lastModified}`))
        .map((file) => ({ id: createLocalId(), file }));
      return [...current, ...next];
    });
  };

  const removeFile = (id: string) => {
    setFiles((current) => current.filter((item) => item.id !== id));
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (!canUpload) return;
    addFiles(event.dataTransfer.files);
  };

  const content = (
    <div className="space-y-4">
      {canUpload ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            if (event.currentTarget.contains(event.relatedTarget as Node)) return;
            setDragging(false);
          }}
          onDrop={onDrop}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center transition-colors duration-200',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
            dragging
              ? 'border-primary/50 bg-primary/10'
              : 'border-border/80 bg-muted/20 hover:border-border hover:bg-muted/35 dark:bg-muted/10',
          )}
        >
          <span
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
              dragging ? 'bg-primary/15 text-primary' : 'bg-muted/70 text-muted-foreground',
            )}
          >
            <Upload className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <div>
            <p className="text-sm font-medium text-foreground">
              Перетащите файлы или выберите на диске
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              До 20 МБ на файл · сохранение на сервер пока не подключено
            </p>
          </div>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            multiple
            className="sr-only"
            onChange={(event) => {
              if (event.target.files) addFiles(event.target.files);
              event.target.value = '';
            }}
          />
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {files.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/70 px-4 py-6 text-center text-sm text-muted-foreground">
          Вложений пока нет.
        </p>
      ) : (
        <ul className="space-y-2" aria-label="Список вложений">
          {files.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 dark:bg-muted/10"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground">
                {fileIcon(item.file.type || 'application/octet-stream')}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{item.file.name}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                  <span className="font-mono tabular-nums">{formatBytes(item.file.size)}</span>
                  <span
                    className="rounded bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-800 dark:text-amber-300"
                    title="Файл только в браузере, до подключения API"
                  >
                    Локально
                  </span>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeFile(item.id)}
                aria-label={`Удалить ${item.file.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  if (embedded) return content;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border/60 bg-muted/20 px-5 py-3.5 dark:bg-muted/10">
        <Paperclip className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Вложения</h2>
        {files.length > 0 ? (
          <span className="font-mono text-xs text-muted-foreground">({files.length})</span>
        ) : null}
      </header>
      <div className="p-5">{content}</div>
    </section>
  );
}
