import { useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { RoadmapPerson, RoadmapRole } from '@/entities/roadmap/api/roadmapApi';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { equalRoleParticipation, parseRoleParticipation, type RoleMemberDraft } from '../../model/role-participation';

const fieldClass = 'min-h-10 w-full min-w-0 rounded-lg border border-input bg-field px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const percentFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

export function RoleMembersEditor({ id, people, members, role, disabled, pickerDisabled, portalContainer, onChange }: {
  id: string;
  people: RoadmapPerson[];
  members: RoleMemberDraft[];
  role?: RoadmapRole;
  disabled: boolean;
  pickerDisabled: boolean;
  portalContainer: HTMLElement | null;
  onChange: (members: RoleMemberDraft[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  const pickerButton = useRef<HTMLButtonElement>(null);
  const memberList = useRef<HTMLUListElement>(null);
  const selected = new Set(members.map((member) => member.personExternalId));
  const existing = new Set(role?.members?.map((member) => member.personExternalId));
  if (role?.defaultPersonExternalId) existing.add(role.defaultPersonExternalId);
  const assignable = people.filter((person) => person.isActive !== false || selected.has(person.id) || existing.has(person.id));
  const term = search.trim().toLocaleLowerCase('ru-RU');
  const visible = open ? assignable.filter((person) => `${person.name} ${person.email ?? ''}`.toLocaleLowerCase('ru-RU').includes(term)) : [];
  const { total, valid } = parseRoleParticipation(members);

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) setSearch('');
  }

  function changeMembers(ids: string[]) {
    onChange(equalRoleParticipation(ids));
  }

  return (
    <section aria-labelledby={`${id}-members`} className="space-y-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 id={`${id}-members`} className="text-sm font-medium">
          Сотрудники <span className="ml-1 font-normal tabular-nums text-muted-foreground">{members.length}</span>
        </h3>
        <Popover open={open} onOpenChange={changeOpen}>
          <PopoverTrigger asChild>
            <Button ref={pickerButton} type="button" variant="ghost" size="sm" disabled={disabled || pickerDisabled} className="-mr-2 px-2 text-primary">
              {members.length ? 'Изменить состав' : 'Добавить сотрудников'}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            portalContainer={portalContainer}
            aria-label="Выбор сотрудников"
            align="end"
            sideOffset={6}
            collisionPadding={12}
            className="flex max-h-[var(--radix-popover-content-available-height)] w-[min(25rem,calc(100vw-1.5rem))] flex-col roadmap-scrollbar overflow-y-auto rounded-xl p-0"
            onOpenAutoFocus={(event) => { event.preventDefault(); searchInput.current?.focus(); }}
          >
            <div className="shrink-0 border-b border-border p-3">
              <label className="relative block">
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input ref={searchInput} type="search" aria-label="Поиск сотрудников" placeholder="Найти по ФИО или почте" value={search} onChange={(event) => setSearch(event.target.value)} className={cn(fieldClass, 'pl-9')} />
              </label>
            </div>
            <fieldset disabled={disabled} className="roadmap-scrollbar relative max-h-60 min-h-24 min-w-0 flex-1 overflow-auto p-1.5">
              <legend className="sr-only">Сотрудники</legend>
              <div className="space-y-0.5">
                {visible.length ? visible.map((person) => (
                  <label key={person.id} className="flex min-h-11 items-center gap-2.5 rounded-md px-2 py-1 text-sm hover:bg-muted">
                    <input type="checkbox" checked={selected.has(person.id)} onChange={(event) => changeMembers(event.target.checked
                      ? [...selected, person.id] : [...selected].filter((personId) => personId !== person.id))} className="size-4 shrink-0 accent-primary" />
                    <span className="min-w-0 flex-1 break-words">
                      <span className="block">{person.name}</span>
                      {person.email && <span className="block text-xs text-muted-foreground">{person.email}</span>}
                    </span>
                    {person.isActive === false && <span className="text-xs text-muted-foreground">Неактивен</span>}
                  </label>
                )) : <p role="status" className="px-2 py-3 text-sm text-muted-foreground">Сотрудники не найдены.</p>}
              </div>
            </fieldset>
            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-3 py-2.5">
              <p className="text-xs text-muted-foreground">Выбрано: {selected.size}</p>
              <Button type="button" size="sm" onClick={() => changeOpen(false)}>Готово</Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <p id={`${id}-participation-hint`} className="text-pretty text-xs leading-5 text-muted-foreground">
        При изменении состава доли делятся поровну. Их можно изменить вручную — всего должно быть 100%.
      </p>
      {members.length ? (
        <>
          <div className="overflow-hidden rounded-lg border border-border">
            <div aria-hidden="true" className="grid grid-cols-[minmax(0,1fr)_5.5rem_2rem] items-center gap-2 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <span>Сотрудник</span><span className="text-right">Участие</span><span />
            </div>
            <ul ref={memberList} aria-label="Участие сотрудников" className="divide-y divide-border">
              {members.map((member, index) => {
                const person = people.find((item) => item.id === member.personExternalId);
                const saved = role?.members?.find((item) => item.personExternalId === member.personExternalId);
                const isLegacyDefault = role?.defaultPersonExternalId === member.personExternalId;
                const name = person?.name ?? saved?.personName ?? (isLegacyDefault ? role?.defaultPersonName : null) ?? 'Сотрудник';
                const email = person?.email ?? saved?.personEmail ?? (isLegacyDefault ? role?.defaultPersonEmail : null);
                const value = Number(member.allocationPercent);
                const invalid = !member.allocationPercent.trim() || !Number.isFinite(value) || value < 0 || value > 100 || Math.abs(value * 100 - Math.round(value * 100)) > 1e-8;
                return (
                  <li key={member.personExternalId} className="grid grid-cols-[minmax(0,1fr)_5.5rem_2rem] items-center gap-2 px-3 py-3">
                    <div className="min-w-0">
                      <label htmlFor={`${id}-share-${index}`} className="block break-words text-sm font-medium leading-5">{name}</label>
                      {email && <p title={email} className="mt-0.5 truncate text-xs text-muted-foreground">{email}</p>}
                      {(person?.isActive ?? saved?.personIsActive) === false && <p className="mt-0.5 text-xs text-muted-foreground">Неактивен</p>}
                    </div>
                    <div className="relative">
                      <input
                        id={`${id}-share-${index}`}
                        aria-label={`Участие: ${name}`}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={100}
                        step={0.01}
                        value={member.allocationPercent}
                        disabled={disabled}
                        aria-invalid={invalid || undefined}
                        aria-describedby={`${id}-participation-hint${!valid ? ` ${id}-participation-error` : ''}`}
                        onChange={(event) => onChange(members.map((item) => item.personExternalId === member.personExternalId ? { ...item, allocationPercent: event.target.value } : item))}
                        className={cn(fieldClass, 'pr-6 text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none', invalid && 'border-destructive')}
                      />
                      <span aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                    </div>
                    <Button type="button" variant="ghost" size="icon" disabled={disabled} aria-label={`Убрать из роли: ${name}`} className="size-8 text-muted-foreground" onClick={() => {
                      const nextRow = memberList.current?.children[index + 1] ?? memberList.current?.children[index - 1];
                      const nextInput = nextRow?.querySelector('input');
                      if (nextInput) nextInput.focus(); else pickerButton.current?.focus();
                      changeMembers([...selected].filter((personId) => personId !== member.personExternalId));
                    }}><X aria-hidden="true" className="size-4" /></Button>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={disabled} className="-ml-2 px-2 text-primary" onClick={() => changeMembers([...selected])}>Разделить поровну</Button>
            <p aria-live="polite" className={cn('text-sm font-medium tabular-nums', !valid && 'text-destructive')}>Итого: {percentFormat.format(total)}%</p>
          </div>
          {!valid && <p id={`${id}-participation-error`} role="status" className="text-xs text-destructive">Укажите доли от 0 до 100% с точностью до сотых. Сумма должна быть 100%.</p>}
        </>
      ) : <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">Добавьте сотрудников, чтобы распределить участие в роли.</p>}
    </section>
  );
}
