import type { WidgetPlacement } from './widgets';
import { widgetSpan } from './layout.ts';

export type WidgetDimensions = { widthUnits: number; heightPx?: number };
export type ResizeOrigin = { widthUnits: number; widthPx: number; heightPx: number; gridWidth: number; gap: number };
export const gridTracks = 12;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function placementUnits(item: WidgetPlacement, columns: number): number {
  return item.widthUnits ?? Math.round(widgetSpan(item, columns) * gridTracks / columns);
}
export function visibleUnits(units: number, gridWidth: number, gap: number): number {
  if (gridWidth <= 0) return clamp(units, 1, gridTracks);
  if (gridWidth <= 560) return gridTracks;
  const pitch = (gridWidth + gap) / gridTracks;
  const minimum = Math.ceil((260 + gap) / pitch);
  return clamp(units, minimum, gridTracks);
}
export function cardRows(height: number, gap: number): number {
  return Math.ceil((clamp(height, 128, 960) + gap) / (4 + gap));
}
export function resizeDimensions(origin: ResizeOrigin, deltaX: number, deltaY: number): WidgetDimensions {
  if (![origin.widthUnits, origin.widthPx, origin.heightPx, origin.gridWidth, origin.gap, deltaX, deltaY].every(Number.isFinite) || origin.gridWidth <= 0 || origin.gap < 0) {
    throw new RangeError('Card dimensions are unavailable.');
  }
  const pitch = (origin.gridWidth + origin.gap) / gridTracks;
  const widthUnits = Math.abs(deltaX) < pitch / 2 ? origin.widthUnits
    : visibleUnits(Math.round((origin.widthPx + deltaX + origin.gap) / pitch), origin.gridWidth, origin.gap);
  return { widthUnits: clamp(widthUnits, 1, gridTracks), heightPx: clamp(Math.round((origin.heightPx + deltaY) / 8) * 8, 128, 960) };
}
export function applyDimensions(layout: WidgetPlacement[], id: string, dimensions: WidgetDimensions): WidgetPlacement[] {
  return layout.map(item => {
    if (item.id !== id) return item;
    const { heightPx: previousHeight, ...rest } = item;
    void previousHeight;
    return { ...rest, widthUnits: dimensions.widthUnits, ...(dimensions.heightPx !== undefined ? { heightPx: dimensions.heightPx } : {}) };
  });
}
