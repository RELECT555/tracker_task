'use client';

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ComponentPropsWithoutRef, type CSSProperties, type RefObject } from 'react';
import { cn } from '@/shared/lib/utils';

export type PlanColumn = {
  id: string;
  label: string;
  width: number;
  minWidth: number;
  maxWidth?: number;
  grow?: boolean;
  customized?: boolean;
};

type FittedColumn = PlanColumn & { maxWidth: number };

type TableContextValue = {
  columns: FittedColumn[];
  layoutKey: string;
  tableRef: RefObject<HTMLTableElement | null>;
  runwayRef: RefObject<HTMLDivElement | null>;
  onColumnResize: (columnId: string, width: number) => void;
};

const TableContext = createContext<TableContextValue | null>(null);
// A role can change position after a background refresh while its handle stays
// mounted. Encode the stable ID instead of binding its draft to a visible index.
const widthProperty = (id: string) => `--plan-col-${Array.from(id, (character) => character.codePointAt(0)!.toString(16)).join('-')}-width`;
const clampWidth = (column: FittedColumn, width: number) => Math.round(Math.min(column.maxWidth, Math.max(column.minWidth, width)));

function fitColumns(columns: PlanColumn[], availableWidth: number): PlanColumn[] {
  const canGrow = (column: PlanColumn) => column.grow && !column.customized;
  let remaining = availableWidth - columns.reduce((total, column) => total + column.width, 0);
  let weight = columns.filter(canGrow).reduce((total, column) => total + column.width, 0);
  return columns.map((column) => {
    if (!canGrow(column) || remaining <= 0) return column;
    const growth = Math.round(remaining * column.width / weight);
    remaining -= growth;
    weight -= column.width;
    return { ...column, width: column.width + growth };
  });
}

type ResizablePlanTableProps = ComponentPropsWithoutRef<'table'> & {
  columns: PlanColumn[];
  onColumnResize: (columnId: string, width: number) => void;
};

/** Exact column widths keep the browser from redistributing space during a drag. */
export function ResizablePlanTable({ columns, onColumnResize, children, className, style, ...props }: ResizablePlanTableProps) {
  const tableRef = useRef<HTMLTableElement>(null);
  const runwayRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const [lockedWidths, setLockedWidths] = useState<{ layoutKey: string; widths: Map<string, number> } | null>(null);
  const layoutKey = JSON.stringify([availableWidth, ...columns.map((column) => column.id)]);
  const hasCustomizedColumns = columns.some((column) => column.customized);
  const keepWidths = hasCustomizedColumns && lockedWidths?.layoutKey === layoutKey;
  const currentColumns = keepWidths
    ? columns.map((column) => column.customized ? column : { ...column, width: lockedWidths.widths.get(column.id) ?? column.width })
    : fitColumns(columns, availableWidth);
  const fittedColumns = currentColumns.map((column) => ({
    ...column,
    maxWidth: column.maxWidth ?? Math.max(1200, availableWidth, column.width),
  }));
  const columnStyles = Object.fromEntries(fittedColumns.map((column) => [widthProperty(column.id), `${clampWidth(column, column.width)}px`]));
  const totalWidth = fittedColumns.length ? `calc(${fittedColumns.map((column) => `var(${widthProperty(column.id)})`).join(' + ')})` : '0px';

  useLayoutEffect(() => {
    const scroller = tableRef.current?.parentElement;
    if (!scroller) return;
    const measure = () => setAvailableWidth(scroller.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (lockedWidths && !keepWidths) setLockedWidths(null);
  }, [keepWidths, lockedWidths]);

  function commitResize(columnId: string, width: number) {
    // Preserve the current fit while the user adjusts individual columns.
    setLockedWidths({ layoutKey, widths: new Map(fittedColumns.map((column) => [column.id, column.width])) });
    onColumnResize(columnId, width);
  }

  useEffect(() => {
    const table = tableRef.current;
    const runway = runwayRef.current;
    const scroller = table?.parentElement;
    if (!table || !runway || !scroller) return;
    const trim = () => trimRunway(table, runway);
    scroller.addEventListener('scroll', trim, { passive: true });
    const observer = new ResizeObserver(trim);
    observer.observe(table);
    observer.observe(scroller);
    return () => {
      scroller.removeEventListener('scroll', trim);
      observer.disconnect();
    };
  }, []);

  return <TableContext.Provider value={{ columns: fittedColumns, layoutKey, tableRef, runwayRef, onColumnResize: commitResize }}>
    <table
      {...props}
      ref={tableRef}
      className={cn('table-fixed border-collapse text-left', className)}
      style={{ ...style, ...columnStyles, width: totalWidth, minWidth: totalWidth, maxWidth: totalWidth } as CSSProperties}
    >
      <colgroup>
        {fittedColumns.map((column) => <col key={column.id} data-column-id={column.id} data-committed-width={clampWidth(column, column.width)} style={{ width: `var(${widthProperty(column.id)})` }} />)}
      </colgroup>
      {children}
    </table>
    <div ref={runwayRef} aria-hidden="true" className="pointer-events-none h-0" style={{ width: 0 }} />
  </TableContext.Provider>;
}

function reserveRunway(table: HTMLTableElement, runway: HTMLDivElement) {
  const scroller = table.parentElement;
  if (scroller) runway.style.width = `${Math.ceil(scroller.scrollLeft + scroller.clientWidth)}px`;
}

function trimRunway(table: HTMLTableElement, runway: HTMLDivElement) {
  const scroller = table.parentElement;
  if (!scroller) return;
  const viewportEnd = scroller.scrollLeft + scroller.clientWidth;
  const tableEnd = table.getBoundingClientRect().right - scroller.getBoundingClientRect().left - scroller.clientLeft + scroller.scrollLeft;
  // Keep only the space needed to preserve the current scroll position. It
  // disappears naturally when scrolling left or when the table grows again.
  runway.style.width = viewportEnd > tableEnd + 1 ? `${Math.ceil(viewportEnd)}px` : '0px';
}

type DragSession = {
  pointerId: number;
  columnId: string;
  layoutKey: string;
  startX: number;
  startWidth: number;
  width: number;
  frame: number | null;
  table: HTMLTableElement;
  runway: HTMLDivElement;
  handle: HTMLDivElement;
  property: string;
  cursor: string;
  userSelect: string;
  removeListeners: () => void;
};

function paintWidth(drag: DragSession, width: number) {
  // Reserve scroll extent before shrinking the table, otherwise the browser
  // clamps scrollLeft immediately and makes the handle stop following the mouse.
  reserveRunway(drag.table, drag.runway);
  drag.table.style.setProperty(drag.property, `${width}px`);
  drag.handle.setAttribute('aria-valuenow', String(width));
  drag.handle.setAttribute('aria-valuetext', `${width} пикселей`);
}

function restoreCommittedWidth(drag: DragSession) {
  if (!drag.table.isConnected) return;
  const column = Array.from(drag.table.querySelectorAll('col')).find((entry) => entry.dataset.columnId === drag.columnId);
  const width = Number(column?.dataset.committedWidth);
  // Read the current committed value, which may have changed in another tab.
  // A removed column must not recreate its obsolete CSS variable on cleanup.
  if (column && Number.isFinite(width)) paintWidth(drag, width);
}

function releaseDrag(drag: DragSession) {
  if (drag.frame !== null) cancelAnimationFrame(drag.frame);
  drag.removeListeners();
  document.body.style.cursor = drag.cursor;
  document.body.style.userSelect = drag.userSelect;
  delete drag.handle.dataset.resizing;
  if (drag.table.hasPointerCapture(drag.pointerId)) drag.table.releasePointerCapture(drag.pointerId);
  trimRunway(drag.table, drag.runway);
}

/** The preview changes only a CSS variable; React and storage update once on release. */
export function ColumnResizeHandle({ columnId }: { columnId: string }) {
  const context = useContext(TableContext);
  const dragRef = useRef<DragSession | null>(null);
  const column = context?.columns.find((entry) => entry.id === columnId);
  const width = column ? clampWidth(column, column.width) : null;
  const layoutKey = context?.layoutKey;

  useLayoutEffect(() => {
    const drag = dragRef.current;
    if (!drag || (drag.columnId === columnId && drag.startWidth === width && drag.layoutKey === layoutKey)) return;
    dragRef.current = null;
    restoreCommittedWidth(drag);
    releaseDrag(drag);
  }, [columnId, width, layoutKey]);

  useEffect(() => () => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    restoreCommittedWidth(drag);
    releaseDrag(drag);
  }, []);

  if (!context) throw new Error('ColumnResizeHandle must be inside ResizablePlanTable');
  const { tableRef, runwayRef, onColumnResize } = context;
  if (!column || width === null) return null;

  const cancelDrag = () => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    restoreCommittedWidth(drag);
    releaseDrag(drag);
  };

  return <div
    role="separator"
    aria-orientation="vertical"
    aria-label={`Изменить ширину: ${column.label}`}
    aria-valuemin={column.minWidth}
    aria-valuemax={column.maxWidth}
    aria-valuenow={width}
    aria-valuetext={`${width} пикселей`}
    data-column-id={columnId}
    tabIndex={0}
    title="Перетащите границу или используйте стрелки влево и вправо"
    onClick={(event) => event.stopPropagation()}
    onPointerDown={(event) => {
      if (event.button !== 0 || !event.isPrimary || dragRef.current || !tableRef.current || !runwayRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      const handle = event.currentTarget;
      const table = tableRef.current;
      const startWidth = Number.parseFloat(table.style.getPropertyValue(widthProperty(columnId))) || width;
      handle.focus({ preventScroll: true });
      const drag: DragSession = {
        pointerId: event.pointerId,
        columnId,
        layoutKey: context.layoutKey,
        startX: event.clientX,
        startWidth,
        width: startWidth,
        frame: null,
        table,
        runway: runwayRef.current,
        handle,
        property: widthProperty(columnId),
        cursor: document.body.style.cursor,
        userSelect: document.body.style.userSelect,
        removeListeners: () => {},
      };
      dragRef.current = drag;
      const move = (pointer: PointerEvent) => {
        if (pointer.pointerId !== drag.pointerId || dragRef.current !== drag) return;
        drag.width = clampWidth(column, drag.startWidth + pointer.clientX - drag.startX);
        if (drag.frame !== null) return;
        drag.frame = requestAnimationFrame(() => {
          drag.frame = null;
          paintWidth(drag, drag.width);
        });
      };
      const finish = (pointer: PointerEvent) => {
        if (pointer.pointerId !== drag.pointerId || dragRef.current !== drag) return;
        dragRef.current = null;
        const nextWidth = clampWidth(column, drag.startWidth + pointer.clientX - drag.startX);
        paintWidth(drag, nextWidth);
        releaseDrag(drag);
        if (nextWidth !== startWidth) onColumnResize(columnId, nextWidth);
      };
      const cancel = (pointer: PointerEvent) => {
        if (pointer.pointerId === drag.pointerId) cancelDrag();
      };
      table.addEventListener('pointermove', move);
      table.addEventListener('pointerup', finish);
      table.addEventListener('pointercancel', cancel);
      table.addEventListener('lostpointercapture', cancel);
      drag.removeListeners = () => {
        table.removeEventListener('pointermove', move);
        table.removeEventListener('pointerup', finish);
        table.removeEventListener('pointercancel', cancel);
        table.removeEventListener('lostpointercapture', cancel);
      };
      // The table stays mounted if a refresh reorders the column headers.
      // Capturing on a moved header would lose pointer capture in Chromium.
      table.setPointerCapture(event.pointerId);
      handle.dataset.resizing = 'true';
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }}
    onKeyDown={(event) => {
      if (event.key === 'Escape' && dragRef.current) {
        event.preventDefault();
        event.stopPropagation();
        cancelDrag();
        return;
      }
      if (dragRef.current) return;
      const step = event.shiftKey ? 40 : 16;
      const nextWidth = event.key === 'ArrowLeft' ? width - step
        : event.key === 'ArrowRight' ? width + step
          : event.key === 'Home' ? column.minWidth
            : event.key === 'End' ? column.maxWidth
              : null;
      if (nextWidth === null) return;
      event.preventDefault();
      event.stopPropagation();
      const clampedWidth = clampWidth(column, nextWidth);
      if (clampedWidth !== width) onColumnResize(columnId, clampedWidth);
    }}
    className="group absolute inset-y-0 right-0 z-30 w-3 cursor-col-resize touch-none select-none outline-none after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-border after:content-[''] hover:after:w-0.5 hover:after:bg-primary focus-visible:after:w-0.5 focus-visible:after:bg-primary data-[resizing=true]:after:w-0.5 data-[resizing=true]:after:bg-primary"
  >
    <span aria-hidden="true" className="absolute right-0 top-1/2 h-8 w-0.5 -translate-y-1/2 rounded-full bg-border group-hover:bg-primary group-focus-visible:bg-primary group-data-[resizing=true]:bg-primary" />
  </div>;
}
