// Author: CA
import loadHighs from './vendor/highs.mjs';
import { compareCategoryAsync } from './category-comparison.mjs';
import {createBuildSolver} from './build-solver.mjs';

let engine;

self.onmessage = async event => {
  try {
    const { catalog, options } = event.data ?? {};
    engine ??= await loadHighs({ locateFile: name => new URL(`vendor/${name}`, import.meta.url).href });
    const result = await compareCategoryAsync(catalog, options, (selection,progress)=>createBuildSolver(catalog,selection,engine,progress), (message, checked, total) => {
      self.postMessage({ type: 'progress', message, checked, total });
    });
    self.postMessage({ type: 'result', result });
  } catch (error) {
    self.postMessage({ type: 'error', message: error?.message || 'Category comparison failed.' });
  }
};
