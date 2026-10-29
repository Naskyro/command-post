import { AppError } from '../shared/errors.ts';
import type { WidgetPlacement } from './widgets';

export type HomeGrid = { columns: 2 | 3 | 4; spacing: 'Comfortable' | 'Compact' };
export const defaultGrid: HomeGrid = { columns: 3, spacing: 'Comfortable' };
export function validateGrid(value: unknown): HomeGrid {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError('Choose a valid Home grid.');
  const grid = value as Record<string, unknown>;
  if (Object.keys(grid).some(key => !['columns', 'spacing'].includes(key)) || ![2, 3, 4].includes(Number(grid.columns)) || typeof grid.columns !== 'number' || !['Comfortable', 'Compact'].includes(String(grid.spacing))) throw new AppError('Choose 2, 3 or 4 columns and a spacing option.');
  return { columns: grid.columns as HomeGrid['columns'], spacing: grid.spacing as HomeGrid['spacing'] };
}
export function widgetSpan(item: WidgetPlacement, columns: number) {
  const span = item.span ?? (item.size === 'Wide' ? 0 : 1);
  return span === 0 ? columns : Math.min(span, columns);
}
export function greeting(name: string, at: number, timeZone = 'America/Chicago') {
  let hour: number;
  try { hour = Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(at)); }
  catch { hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hourCycle: 'h23' }).format(at)); }
  const salutation = hour >= 5 && hour < 12 ? 'Good Morning' : hour >= 12 && hour < 17 ? 'Good Afternoon' : 'Good Evening';
  const first = name.trim().split(/\s+/)[0];
  return first ? `${salutation}, ${first}` : salutation;
}
