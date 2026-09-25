/**
 * Chart color slots, derived from the app's semantic CSS variables so every chart follows
 * light/dark mode automatically. Apply `CHART_VARS` on a wrapper, then reference the slots
 * as `var(--chart-1)` etc. in SVG props.
 *
 * Validated with the dataviz palette checker (lightness band, chroma floor, CVD separation,
 * contrast) against the light surface and the dark surface. In dark mode the accent token is
 * too light for a data mark, so slot 2 is re-stepped to L=0.64 while keeping its hue/chroma.
 *
 * - `--chart-context`: de-emphasised context series (neutral gray, never carries identity alone)
 * - `--chart-1`: primary series
 * - `--chart-2`: secondary series
 */
export const CHART_VARS =
  "[--chart-context:var(--text-subtle)] [--chart-1:var(--primary)] [--chart-2:var(--accent)] " +
  "dark:[--chart-2:oklch(from_var(--accent)_0.64_c_h)]";

/** Normalise a 0–1 or 0–100 rate into a percentage, preferring raw counts when available. */
export function ratePct(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return (numerator / denominator) * 100;
}

export function formatCount(n: number) {
  return new Intl.NumberFormat(undefined, { notation: n >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n);
}
