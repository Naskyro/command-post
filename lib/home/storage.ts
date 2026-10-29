import { financeDb } from '@/db/finance';
import type { Viewer } from '../finance/model';
import { ConflictError, AppError } from '../shared/errors';
import { defaultLayout, restoreLayout, type WidgetDefinition, type WidgetPlacement } from './widgets';

import { defaultGrid, validateGrid, type HomeGrid } from './layout';

type LayoutRow = { grid: string; widgets: string; version: number; updated_at: string };
export async function readHomeLayout(v: Viewer, available: WidgetDefinition[]) {
  const row = await financeDb().prepare('SELECT widgets, grid, version, updated_at FROM home_layouts WHERE person_id = ?').bind(v.person).first<LayoutRow>();
  if (!row) return { layout: defaultLayout(v, available), grid: defaultGrid, version: 0, updatedAt: null };
  let parsed: unknown, grid: HomeGrid;
  try { parsed = JSON.parse(row.widgets); grid = validateGrid(JSON.parse(row.grid)); }
  catch { throw new AppError('Your saved Home layout could not be read.', 503); }
  return { layout: restoreLayout(parsed, available), grid, version: row.version, updatedAt: row.updated_at };
}
export async function writeHomeLayout(v: Viewer, widgets: WidgetPlacement[], version: number, grid: HomeGrid) {
  const at = new Date().toISOString();
  const result = version === 0
    ? await financeDb().prepare('INSERT INTO home_layouts (person_id, widgets, grid, version, updated_by, updated_at) VALUES (?, ?, ?, 1, ?, ?) ON CONFLICT(person_id) DO NOTHING').bind(v.person, JSON.stringify(widgets), JSON.stringify(grid), v.id, at).run()
    : await financeDb().prepare('UPDATE home_layouts SET widgets = ?, grid = ?, version = version + 1, updated_by = ?, updated_at = ? WHERE person_id = ? AND version = ?').bind(JSON.stringify(widgets), JSON.stringify(grid), v.id, at, v.person, version).run();
  if (result.meta.changes !== 1) throw new ConflictError('Home changed in another tab. Close customization and refresh before saving again.');
  return { layout: widgets, grid, version: version + 1, updatedAt: at };
}
