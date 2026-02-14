import React, { useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Minimize2, Maximize2, Maximize } from 'lucide-react';
import type { WidgetZones, ZoneName } from './types';

interface DashboardLayoutProps {
  widgetZones: WidgetZones;
  setWidgetZones: React.Dispatch<React.SetStateAction<WidgetZones>>;
  renderWidget: (widget: string) => JSX.Element;
  widgetLabels?: Record<string, string>;
  collapsedWidgets: Record<string, boolean>;
  expandedWidget: string | null;
  onToggleCollapse: (widget: string) => void;
  onToggleExpand: (widget: string) => void;
}

type ActiveDrag = { id: string; fromZone: ZoneName } | null;

interface SortableWidgetProps {
  id: string;
  title: string;
  collapsed: boolean;
  expanded: boolean;
  onToggleCollapse: (id: string) => void;
  onToggleExpand: (id: string) => void;
  children: React.ReactNode;
}

function SortableWidget({ id, title, collapsed, expanded, onToggleCollapse, onToggleExpand, children }: SortableWidgetProps): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.9 : 1
  };

  const containerClasses = expanded
    ? 'fixed inset-0 z-50 bg-slate-950 overflow-auto p-6'
    : 'relative hover:border-slate-700 hover:bg-slate-900/80 transition-colors';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group border border-slate-800 rounded-xl bg-slate-900/60 p-3 shadow-lg min-h-[80px] ${containerClasses}`}
      {...attributes}
    >
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
          onClick={() => onToggleCollapse(id)}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
        </button>
        <button
          className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
          onClick={() => onToggleExpand(id)}
          title={expanded ? 'Exit full screen' : 'Full screen'}
        >
          {expanded ? <Minimize2 size={16} /> : <Maximize size={16} />}
        </button>
      </div>

      <div className="flex items-start gap-2">
        <button
          className="mt-1 p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white cursor-grab"
          {...listeners}
          aria-label="Drag widget"
        >
          <GripVertical size={16} />
        </button>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-white leading-tight">{title}</h2>
          </div>
          {!collapsed && <div className="space-y-2">{children}</div>}
        </div>
      </div>
    </div>
  );
}

export function DashboardLayout({ widgetZones, setWidgetZones, renderWidget, widgetLabels = {}, collapsedWidgets, expandedWidget, onToggleCollapse, onToggleExpand }: DashboardLayoutProps): JSX.Element {
  const [mainWidth, setMainWidth] = useState(60);
  const [resizing, setResizing] = useState(false);
  const [activeDrag, setActiveDrag] = useState<ActiveDrag>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const startResizing = () => setResizing(true);
  const stopResizing = () => setResizing(false);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!resizing) return;
    const pct = Math.min(80, Math.max(20, (e.clientX / window.innerWidth) * 100));
    setMainWidth(pct);
  };

  const getZoneForId = (id: string): ZoneName | null => {
    if (widgetZones.header.includes(id)) return 'header';
    if (widgetZones.main.includes(id)) return 'main';
    if (widgetZones.secondary.includes(id)) return 'secondary';
    if (widgetZones.footer.includes(id)) return 'footer';
    return null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const fromZone = getZoneForId(String(event.active.id));
    setActiveDrag(fromZone ? { id: String(event.active.id), fromZone } : null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDrag(null);
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const fromZone = getZoneForId(activeId);
    const toZone = getZoneForId(overId);

    // If dropped on empty space within same zone container, infer zone from data
    const targetZone: ZoneName | null = toZone || (over.data?.current?.zone as ZoneName | null) || null;
    if (!fromZone || !targetZone) return;

    if (fromZone === targetZone) {
      const oldIndex = widgetZones[fromZone].indexOf(activeId);
      const newIndex = widgetZones[targetZone].indexOf(overId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
      setWidgetZones((prev) => ({ ...prev, [fromZone]: arrayMove(prev[fromZone], oldIndex, newIndex) }));
      return;
    }

    // Move across zones: remove from source, append after target (or end if placeholder)
    setWidgetZones((prev) => {
      const next: WidgetZones = {
        header: prev.header.filter((w) => w !== activeId),
        main: prev.main.filter((w) => w !== activeId),
        secondary: prev.secondary.filter((w) => w !== activeId),
        footer: prev.footer.filter((w) => w !== activeId)
      };

      const insertIndex = targetZone && next[targetZone].includes(overId)
        ? next[targetZone].indexOf(overId)
        : next[targetZone].length;

      next[targetZone] = [
        ...next[targetZone].slice(0, insertIndex),
        activeId,
        ...next[targetZone].slice(insertIndex)
      ];
      return next;
    });
  };

  const zoneRender = (zone: ZoneName) => (
    <SortableContext items={widgetZones[zone]} strategy={rectSortingStrategy}>
      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns:
            zone === 'header'
              ? 'repeat(auto-fit, minmax(160px, 1fr))'
              : zone === 'main'
                ? widgetZones.main.length <= 2
                  ? '1fr'
                  : 'repeat(auto-fit, minmax(400px, 1fr))'
                : 'repeat(auto-fit, minmax(280px, 1fr))'
        }}
        data-zone={zone}
      >
        {widgetZones[zone].length === 0 && (
          <div className="border border-dashed border-slate-700 rounded-xl bg-slate-900/40 p-6 text-center text-slate-500 text-sm">
            Drag widgets here
          </div>
        )}
        {widgetZones[zone].map((widget) => (
          <SortableWidget
            key={widget}
            id={widget}
            title={widgetLabels[widget] || widget}
            collapsed={Boolean(collapsedWidgets[widget])}
            expanded={expandedWidget === widget}
            onToggleCollapse={onToggleCollapse}
            onToggleExpand={onToggleExpand}
          >
            {renderWidget(widget)}
          </SortableWidget>
        ))}
      </div>
    </SortableContext>
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div
        className="flex-1 flex flex-col min-h-screen"
        onMouseMove={handleMouseMove}
        onMouseUp={stopResizing}
        onMouseLeave={stopResizing}
      >
        {/* Header zone */}
        {widgetZones.header.length > 0 && (
          <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur px-6 py-4">
            <div className="flex flex-wrap items-center gap-3">{zoneRender('header')}</div>
          </header>
        )}

        {/* Main + Secondary */}
        <div className="flex flex-1 flex-col lg:flex-row">
          <main className="flex-1 p-6 overflow-auto" style={{ width: `100%`, maxWidth: '100%' }}>
            {zoneRender('main')}
          </main>

          <div
            className="hidden lg:block w-2 bg-slate-700 cursor-col-resize hover:bg-slate-500"
            onMouseDown={startResizing}
          />

          {widgetZones.secondary.length > 0 && (
            <aside className="p-6 overflow-auto lg:w-auto lg:flex-shrink-0" style={{ width: `${100 - mainWidth}%` }}>
              {zoneRender('secondary')}
            </aside>
          )}
        </div>

        {/* Footer */}
        {widgetZones.footer.length > 0 && (
          <footer className="border-t border-slate-800 bg-slate-900/80 px-6 py-3">{zoneRender('footer')}</footer>
        )}
      </div>
    </DndContext>
  );
}
