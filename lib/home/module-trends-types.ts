/** Aggregated for Home: these series intentionally carry no personnel, vehicle or property identifiers. */
export type MonthlySeries = {
  asOf: string;
  unit: string;
  secondaryUnit?: string;
  months: {month: string; value: number|null; secondary: number|null}[];
  note: string;
};
export type HomeBusinessTrends = {hires: MonthlySeries|null; tows: MonthlySeries|null};
