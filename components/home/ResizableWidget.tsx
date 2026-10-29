'use client';
import { useEffect, useRef, useState, type CSSProperties, type DragEventHandler, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { cardRows, placementUnits, resizeDimensions, visibleUnits, type ResizeOrigin, type WidgetDimensions } from '@/lib/home/dimensions';
import type { WidgetPlacement } from '@/lib/home/widgets';

type Props = {
  title: string;
  placement: WidgetPlacement;
  columns: number;
  gridWidth: number;
  gap: number;
  disabled: boolean;
  className?: string;
  onResize: (dimensions: WidgetDimensions) => Promise<void>;
  onDragOver: DragEventHandler<HTMLElement>;
  onDrop: DragEventHandler<HTMLElement>;
  children: ReactNode;
};
type Gesture = { pointer: number; x: number; y: number; origin: ResizeOrigin; moved: boolean };

export default function ResizableWidget({ title, placement, columns, gridWidth, gap, disabled, className = '', onResize, onDragOver, onDrop, children }: Props) {
  const cardRef = useRef<HTMLElement>(null), contentRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null), currentSize = useRef<WidgetDimensions | null>(null);
  const keyboardSizing = useRef(false), committing = useRef(false);
  const [naturalHeight, setNaturalHeight] = useState(200), [preview, setPreview] = useState<WidgetDimensions | null>(null);
  const baseUnits = placementUnits(placement, columns);
  const widthUnits = visibleUnits(preview?.widthUnits ?? baseUnits, gridWidth, gap);
  const height = preview?.heightPx ?? placement.heightPx ?? Math.min(320, Math.max(128, naturalHeight));

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const measure = () => setNaturalHeight(Math.ceil(content.getBoundingClientRect().height) + 2);
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  function showSize(value: WidgetDimensions | null) { currentSize.current = value; setPreview(value); }
  function cancel() { gesture.current = null; keyboardSizing.current = false; showSize(null); }
  async function commit(value: WidgetDimensions) {
    if (committing.current) return;
    if (disabled) { showSize(null); return; }
    committing.current = true;
    try { await onResize(value); }
    finally { committing.current = false; showSize(null); }
  }
  function start(event: PointerEvent<HTMLButtonElement>) {
    if (disabled || committing.current || !event.isPrimary || event.button !== 0 || !cardRef.current || gridWidth <= 0) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    const rect = cardRef.current.getBoundingClientRect();
    gesture.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY + window.scrollY, moved: false,
      origin: { widthUnits: baseUnits, widthPx: rect.width, heightPx: rect.height, gridWidth, gap } };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function change(event: PointerEvent<HTMLButtonElement>) {
    const active = gesture.current;
    if (!active || active.pointer !== event.pointerId) return;
    const dx = event.clientX - active.x, dy = event.clientY + window.scrollY - active.y;
    if (Math.abs(dx) + Math.abs(dy) <= 3 && !active.moved) return;
    active.moved = true;
    showSize(resizeDimensions(active.origin, dx, dy));
  }
  function finish(event: PointerEvent<HTMLButtonElement>) {
    const active = gesture.current;
    if (!active || active.pointer !== event.pointerId) return;
    change(event);
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (active.moved && currentSize.current) void commit(currentSize.current);
  }
  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Escape') { event.preventDefault(); cancel(); return; }
    if (disabled || committing.current || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    keyboardSizing.current = true;
    const previous = currentSize.current ?? { widthUnits: baseUnits, heightPx: cardRef.current?.getBoundingClientRect().height ?? height };
    showSize({ widthUnits: Math.max(1, Math.min(12, previous.widthUnits + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0))),
      heightPx: Math.max(128, Math.min(960, Math.round((previous.heightPx ?? height) + (event.key === 'ArrowDown' ? 16 : event.key === 'ArrowUp' ? -16 : 0)))) });
  }
  function finishKeyboard() {
    if (!keyboardSizing.current || !currentSize.current) return;
    keyboardSizing.current = false;
    void commit(currentSize.current);
  }
  const style: CSSProperties = { gridColumn: `span ${widthUnits}`, gridRow: `span ${cardRows(height, gap)}` };
  return <section ref={cardRef} className={'h-widget ' + className + (preview ? ' h-resizing' : '')} style={style} data-widget={placement.id} aria-label={title} onDragOver={onDragOver} onDrop={onDrop}>
    <div className="h-widget-viewport"><div ref={contentRef} className="h-widget-content">{children}</div></div>
    {preview && <output className="h-resize-size" aria-live="off">{Math.round((gridWidth + gap) * widthUnits / 12 - gap)} × {Math.round(height)}</output>}
    <button className="h-resize-handle" disabled={disabled} aria-label={'Resize ' + title} aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Escape"
      title="Drag to resize. Double-click to fit content. Arrow keys also resize."
      onPointerDown={start} onPointerMove={change} onPointerUp={finish} onPointerCancel={cancel}
      onLostPointerCapture={() => { if (gesture.current) cancel(); }}
      onKeyDown={keyDown} onKeyUp={event => { if (event.key.startsWith('Arrow')) finishKeyboard(); }} onBlur={finishKeyboard}
      onDoubleClick={() => { if (!disabled) void commit({ widthUnits: baseUnits }); }}>
      <span className="h-resize-grip" aria-hidden="true" />
    </button>
  </section>;
}
