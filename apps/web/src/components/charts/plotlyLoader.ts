import type * as PlotlyNS from 'plotly.js';

export type PlotlyModule = typeof PlotlyNS;

let promise: Promise<PlotlyModule> | null = null;

/** Plotly is ~4.8 MB minified, so it is code-split and loaded on first chart render. */
export function loadPlotly(): Promise<PlotlyModule> {
  if (!promise) {
    promise = import('plotly.js-dist-min').then((m) => {
      const mod = m as unknown as { default?: PlotlyModule } & PlotlyModule;
      return mod.default ?? mod;
    });
  }
  return promise;
}
