"use client";

import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

/**
 * A sidebar nav group whose items can be dragged into a new order (the
 * pipelines). The whole row is the handle — a press that travels a few pixels
 * is a drag, anything less is still a click — so there's no grip cluttering
 * the sidebar. Keyboard: focus a row, Space to lift, arrows to move, Space to
 * drop.
 */
export function SortableNav({
  ids,
  disabled,
  onReorder,
  children,
}: {
  ids: string[];
  disabled?: boolean;
  onReorder: (from: number, to: number) => void;
  children: React.ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = ids.indexOf(String(e.active.id));
    const to = ids.indexOf(String(e.over.id));
    if (from !== -1 && to !== -1) onReorder(from, to);
  }

  if (disabled) return <>{children}</>;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

export function SortableNavItem({
  id,
  sortable,
  className,
  onClick,
  children,
  ...rest
}: {
  id: string;
  /** False outside a SortableNav (or for a viewer): a plain button. */
  sortable: boolean;
  className: string;
  onClick: () => void;
  children: React.ReactNode;
  "data-tour"?: string;
}) {
  if (!sortable) {
    return (
      <button className={className} onClick={onClick} {...rest}>
        {children}
      </button>
    );
  }
  return (
    <SortableButton id={id} className={className} onClick={onClick} {...rest}>
      {children}
    </SortableButton>
  );
}

function SortableButton({
  id,
  className,
  onClick,
  children,
  ...rest
}: {
  id: string;
  className: string;
  onClick: () => void;
  children: React.ReactNode;
  "data-tour"?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  return (
    <button
      ref={setNodeRef}
      className={`${className}${isDragging ? " nav-dragging" : ""}`}
      onClick={onClick}
      // Vertical only: the sidebar is one column, sideways drift just looks loose.
      style={{
        transform: transform ? `translate3d(0, ${Math.round(transform.y)}px, 0)` : undefined,
        transition,
      }}
      {...rest}
      {...attributes}
      {...listeners}
    >
      {children}
    </button>
  );
}
