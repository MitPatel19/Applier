"use client";

import * as React from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronLeft, ChevronRight, GripVertical } from "lucide-react";
import type { Application, ApplicationStatus, Board } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { scrollBehavior } from "@/components/interviews/time";
import { ApplicationCard } from "./application-card";
import { TONE_COLOR, flattenBoard, type Lane } from "./lanes";
import type { StatusFlow } from "./status-flow";

type LaneIds = Record<string, number[]>;

const laneKey = (id: string) => `lane:${id}`;
const appKey = (id: number) => `app:${id}`;
const parseApp = (key: UniqueIdentifier) => (String(key).startsWith("app:") ? Number(String(key).slice(4)) : null);
const parseLane = (key: UniqueIdentifier) => (String(key).startsWith("lane:") ? String(key).slice(5) : null);

/** Groups the board's applications into the visible lanes (filtered, sorted by board position). */
export function useLaneItems(board: Board | undefined, lanes: Lane[], filter: (a: Application) => boolean) {
  return React.useMemo(() => {
    const all = flattenBoard(board);
    const byLane: Record<string, Application[]> = {};
    for (const lane of lanes) {
      byLane[lane.id] = all
        .filter((a) => lane.statuses.includes(a.status) && filter(a))
        .sort((a, b) => a.board_position - b.board_position || a.id - b.id);
    }
    return byLane;
  }, [board, lanes, filter]);
}

function findLane(ids: LaneIds, key: UniqueIdentifier): string | null {
  const lane = parseLane(key);
  if (lane) return lane in ids ? lane : null;
  const app = parseApp(key);
  if (app === null) return null;
  for (const [laneId, list] of Object.entries(ids)) if (list.includes(app)) return laneId;
  return null;
}

/** Position between the neighbours at `index` in `order` (fractional positions keep other cards untouched). */
function positionAt(order: number[], index: number, byId: Map<number, Application>) {
  const prev = index > 0 ? byId.get(order[index - 1]) : undefined;
  const next = index < order.length - 1 ? byId.get(order[index + 1]) : undefined;
  if (prev && next) {
    if (prev.board_position === next.board_position) return prev.board_position + 0.5;
    return (prev.board_position + next.board_position) / 2;
  }
  if (prev) return prev.board_position + 1;
  if (next) return next.board_position - 1;
  return 0;
}

// ---------------------------------------------------------------- sortable card
function SortableCard({
  app,
  lane,
  now,
  flow,
}: {
  app: Application;
  lane: Lane;
  now: number;
  flow: StatusFlow;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: appKey(app.id),
    data: { type: "card", laneId: lane.id },
  });
  const onPointerDown = listeners?.onPointerDown as React.PointerEventHandler<HTMLDivElement> | undefined;
  const onKeyDown = listeners?.onKeyDown as React.KeyboardEventHandler<HTMLButtonElement> | undefined;
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      onPointerDown={onPointerDown}
      className="cursor-grab touch-manipulation active:cursor-grabbing"
    >
      <ApplicationCard
        app={app}
        lane={lane}
        now={now}
        dragging={isDragging}
        onMove={(s) => flow.request(app, s)}
        handle={
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            onKeyDown={onKeyDown}
            aria-label={`Move ${app.job_title} at ${app.company_name}`}
            className="-ml-1 mt-0.5 flex h-7 w-5 shrink-0 cursor-grab items-center justify-center rounded-md text-subtle opacity-60 transition-opacity hover:bg-bg-subtle hover:text-text group-hover/card:opacity-100 focus-visible:opacity-100"
          >
            <GripVertical className="size-4" />
          </button>
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------- column
function LaneColumn({
  lane,
  items,
  now,
  flow,
  total,
  isOver,
}: {
  lane: Lane;
  items: Application[];
  now: number;
  flow: StatusFlow;
  total: number;
  isOver: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: laneKey(lane.id), data: { type: "lane" } });
  const color = TONE_COLOR[lane.tone];
  const Icon = lane.icon;
  const headingId = `lane-${lane.id}-heading`;
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "relative flex w-[18rem] shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-bg-subtle/70 transition-colors xl:w-[19rem]",
        isOver && "border-primary/40 bg-primary-soft/40",
      )}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: color }} />
      <header className="flex items-start gap-2.5 px-3.5 pb-2 pt-3.5">
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-lg [&_svg]:size-3.5"
          style={{ background: `color-mix(in oklab, ${color} 14%, transparent)`, color }}
          aria-hidden
        >
          <Icon />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="flex items-center gap-2 text-sm font-semibold">
            <span className="truncate">{lane.label}</span>
            <span className="tabular rounded-full bg-surface px-1.5 py-px text-[11px] font-semibold text-muted ring-1 ring-border">
              {items.length}
              {total !== items.length && <span className="font-normal text-subtle">/{total}</span>}
            </span>
          </h2>
          <p className="truncate text-[11px] text-subtle">{lane.hint}</p>
        </div>
      </header>
      <SortableContext id={laneKey(lane.id)} items={items.map((a) => appKey(a.id))} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className="scrollbar-thin flex min-h-32 flex-1 flex-col gap-2.5 overflow-y-auto px-2.5 pb-3 pt-1 md:max-h-[calc(100dvh-19rem)]"
        >
          {items.map((app) => (
            <SortableCard key={app.id} app={app} lane={lane} now={now} flow={flow} />
          ))}
          {items.length === 0 && (
            <div
              className={cn(
                "flex flex-1 items-center justify-center rounded-xl border border-dashed border-border-strong/70 px-4 py-8 text-center text-xs text-subtle transition-colors",
                isOver && "border-primary text-primary",
              )}
            >
              {isOver ? "Drop to move here" : "Nothing here yet"}
            </div>
          )}
        </div>
      </SortableContext>
    </section>
  );
}

// ---------------------------------------------------------------- board (desktop / tablet)
export function PipelineBoard({
  board,
  lanes,
  laneItems,
  laneTotals,
  now,
  flow,
}: {
  board: Board;
  lanes: Lane[];
  laneItems: Record<string, Application[]>;
  laneTotals: Record<string, number>;
  now: number;
  flow: StatusFlow;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const byId = React.useMemo(() => new Map(flattenBoard(board).map((a) => [a.id, a])), [board]);
  const lanesById = React.useMemo(() => new Map(lanes.map((l) => [l.id, l])), [lanes]);

  const [dragIds, setDragIds] = React.useState<LaneIds | null>(null);
  const [activeId, setActiveId] = React.useState<number | null>(null);
  const [overLane, setOverLane] = React.useState<string | null>(null);
  // Final order kept visible between drop and the optimistic cache update (discarded when the board changes).
  const [pending, setPending] = React.useState<{ ids: LaneIds; base: Board } | null>(null);
  const [prevBoard, setPrevBoard] = React.useState(board);
  if (prevBoard !== board) {
    setPrevBoard(board);
    setPending(null);
  }

  const idsRef = React.useRef<LaneIds>({});
  const originRef = React.useRef<{ laneId: string; index: number } | null>(null);

  const baseIds = React.useMemo(() => {
    const ids: LaneIds = {};
    for (const [laneId, list] of Object.entries(laneItems)) ids[laneId] = list.map((a) => a.id);
    return ids;
  }, [laneItems]);

  const currentIds = dragIds ?? (pending && pending.base === board ? pending.ids : baseIds);
  const visible = React.useMemo(() => {
    const out: Record<string, Application[]> = {};
    for (const lane of lanes) out[lane.id] = (currentIds[lane.id] ?? []).map((id) => byId.get(id)).filter((a): a is Application => !!a);
    return out;
  }, [currentIds, lanes, byId]);

  const describe = (key: UniqueIdentifier) => {
    const id = parseApp(key);
    const app = id !== null ? byId.get(id) : undefined;
    return app ? `${app.job_title} at ${app.company_name}` : "Application";
  };
  const laneLabel = (laneId: string | null) => (laneId ? lanesById.get(laneId)?.label ?? "stage" : "stage");

  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      const laneId = findLane(idsRef.current, active.id);
      const list = laneId ? idsRef.current[laneId] : [];
      const idx = list.indexOf(parseApp(active.id) ?? -1);
      return `Picked up ${describe(active.id)} in ${laneLabel(laneId)}, position ${idx + 1} of ${list.length}. Use arrow keys to move between stages, space or enter to drop, escape to cancel.`;
    },
    onDragOver: ({ active, over }) => {
      if (!over) return `${describe(active.id)} is no longer over a stage.`;
      const laneId = findLane(idsRef.current, over.id);
      const list = laneId ? idsRef.current[laneId] : [];
      const overApp = parseApp(over.id);
      const idx = overApp !== null ? list.indexOf(overApp) : list.length - 1;
      return `${describe(active.id)} is over ${laneLabel(laneId)}${idx >= 0 ? `, position ${idx + 1} of ${Math.max(list.length, 1)}` : ""}.`;
    },
    onDragEnd: ({ active, over }) =>
      over ? `${describe(active.id)} dropped in ${laneLabel(findLane(idsRef.current, over.id))}.` : `${describe(active.id)} dropped.`,
    onDragCancel: ({ active }) =>
      `Moving ${describe(active.id)} was cancelled. It stays in ${laneLabel(originRef.current?.laneId ?? null)}.`,
  };

  const reset = () => {
    setDragIds(null);
    setActiveId(null);
    setOverLane(null);
    originRef.current = null;
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    const snapshot: LaneIds = {};
    for (const [k, v] of Object.entries(currentIds)) snapshot[k] = [...v];
    idsRef.current = snapshot;
    const laneId = findLane(snapshot, active.id);
    const id = parseApp(active.id);
    originRef.current = laneId && id !== null ? { laneId, index: snapshot[laneId].indexOf(id) } : null;
    setDragIds(snapshot);
    setActiveId(id);
    setOverLane(laneId);
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const ids = idsRef.current;
    const from = findLane(ids, active.id);
    const to = findLane(ids, over.id);
    setOverLane(to);
    if (!from || !to || from === to) return;
    const id = parseApp(active.id);
    if (id === null) return;
    const target = [...ids[to]];
    const overApp = parseApp(over.id);
    let index = overApp !== null ? target.indexOf(overApp) : target.length;
    if (overApp !== null && over.rect && active.rect.current.translated) {
      const below = active.rect.current.translated.top > over.rect.top + over.rect.height / 2;
      if (below) index += 1;
    }
    target.splice(index < 0 ? target.length : index, 0, id);
    const next: LaneIds = { ...ids, [from]: ids[from].filter((x) => x !== id), [to]: target };
    idsRef.current = next;
    setDragIds(next);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const origin = originRef.current;
    const ids = idsRef.current;
    const id = parseApp(active.id);
    const app = id !== null ? byId.get(id) : undefined;
    reset();
    if (!over || !origin || id === null || !app) return;
    const laneId = findLane(ids, over.id);
    if (!laneId) return;
    let order = ids[laneId];
    const overApp = parseApp(over.id);
    const from = order.indexOf(id);
    if (overApp !== null && overApp !== id) {
      const to = order.indexOf(overApp);
      if (from !== -1 && to !== -1 && from !== to) order = arrayMove(order, from, to);
    }
    const index = order.indexOf(id);
    if (index === -1) return;
    if (laneId === origin.laneId && index === origin.index) return;
    const lane = lanesById.get(laneId);
    if (!lane) return;
    const status: ApplicationStatus = lane.statuses.includes(app.status) ? app.status : lane.primary;
    const board_position = positionAt(order, index, byId);
    if (status !== "rejected" || app.status === "rejected") {
      setPending({ ids: { ...ids, [laneId]: order }, base: board });
    }
    flow.request(app, status, { board_position });
  };

  const activeApp = activeId !== null ? byId.get(activeId) : undefined;
  const activeLane = activeApp ? lanes.find((l) => l.statuses.includes(activeApp.status)) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={reset}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            "To move an application, press space or enter on its handle, use the arrow keys to choose a stage and position, then press space or enter to drop. Press escape to cancel. Each card also has an Actions menu with a Move to list.",
        },
      }}
    >
      <div className="scrollbar-thin -mx-4 flex gap-3.5 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8" role="list" aria-label="Pipeline stages">
        {lanes.map((lane) => (
          <div role="listitem" key={lane.id} className="flex">
            <LaneColumn
              lane={lane}
              items={visible[lane.id] ?? []}
              total={laneTotals[lane.id] ?? 0}
              now={now}
              flow={flow}
              isOver={!!dragIds && overLane === lane.id}
            />
          </div>
        ))}
      </div>
      <DragOverlay dropAnimation={scrollBehavior() === "auto" ? null : { duration: 180, easing: "cubic-bezier(0.2,0.7,0.2,1)" }}>
        {activeApp ? <ApplicationCard app={activeApp} lane={activeLane} now={now} onMove={() => undefined} overlay className="w-[17rem]" /> : null}
      </DragOverlay>
    </DndContext>
  );
}

// ---------------------------------------------------------------- mobile: stage selector + list
export function PipelineStageList({
  lanes,
  laneItems,
  now,
  flow,
}: {
  lanes: Lane[];
  laneItems: Record<string, Application[]>;
  now: number;
  flow: StatusFlow;
}) {
  const firstNonEmpty = lanes.find((l) => (laneItems[l.id] ?? []).length > 0)?.id ?? lanes[0]?.id;
  const [selected, setSelected] = React.useState<string | null>(null);
  const activeId = selected && lanes.some((l) => l.id === selected) ? selected : firstNonEmpty;
  const index = Math.max(0, lanes.findIndex((l) => l.id === activeId));
  const lane = lanes[index];
  const items = lane ? laneItems[lane.id] ?? [] : [];
  const chipRefs = React.useRef<Map<string, HTMLButtonElement>>(new Map());

  const select = (id: string) => {
    setSelected(id);
    chipRefs.current.get(id)?.scrollIntoView({ behavior: scrollBehavior(), inline: "center", block: "nearest" });
  };

  if (!lane) return null;
  const color = TONE_COLOR[lane.tone];
  return (
    <div>
      <div
        className="scrollbar-thin -mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-3"
        role="group"
        aria-label="Choose a pipeline stage"
      >
        {lanes.map((l) => {
          const active = l.id === lane.id;
          const count = (laneItems[l.id] ?? []).length;
          return (
            <button
              key={l.id}
              ref={(el) => {
                if (el) chipRefs.current.set(l.id, el);
                else chipRefs.current.delete(l.id);
              }}
              type="button"
              aria-pressed={active}
              aria-controls="pipeline-stage-panel"
              onClick={() => select(l.id)}
              className={cn(
                "flex h-9 shrink-0 snap-start items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors",
                active ? "border-transparent bg-text text-bg shadow-card" : "border-border bg-surface text-muted hover:text-text",
              )}
            >
              <span className="size-1.5 rounded-full" style={{ background: TONE_COLOR[l.tone] }} aria-hidden />
              {l.label}
              <span className={cn("tabular text-xs", active ? "text-bg/70" : "text-subtle")}>{count}</span>
            </button>
          );
        })}
      </div>

      <section id="pipeline-stage-panel" aria-label={`${lane.label} stage`} className="rounded-2xl border border-border bg-bg-subtle/70">
        <div className="relative flex items-center gap-2 px-3 py-3">
          <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] rounded-t-2xl" style={{ background: color }} />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Previous stage"
            disabled={index === 0}
            onClick={() => select(lanes[index - 1].id)}
          >
            <ChevronLeft />
          </Button>
          <div className="min-w-0 flex-1 text-center">
            <p className="text-sm font-semibold">
              {lane.label} <span className="tabular font-normal text-subtle">· {items.length}</span>
            </p>
            <p className="truncate text-[11px] text-subtle">{lane.hint}</p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Next stage"
            disabled={index === lanes.length - 1}
            onClick={() => select(lanes[index + 1].id)}
          >
            <ChevronRight />
          </Button>
        </div>
        <ul className="space-y-2.5 px-2.5 pb-3">
          {items.map((app) => (
            <li key={app.id}>
              <ApplicationCard app={app} lane={lane} now={now} onMove={(s) => flow.request(app, s)} />
            </li>
          ))}
          {items.length === 0 && (
            <li className="rounded-xl border border-dashed border-border-strong/70 px-4 py-10 text-center text-sm text-subtle">
              No applications in {lane.label} right now.
            </li>
          )}
        </ul>
        <p className="border-t border-border px-4 py-2.5 text-center text-[11px] text-subtle">
          Use the <span className="font-medium text-muted">•••</span> menu on a card to move it to another stage.
        </p>
      </section>
    </div>
  );
}
