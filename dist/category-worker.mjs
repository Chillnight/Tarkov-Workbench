// Author: CA
import loadHighs from './vendor/highs.mjs';
import { compareCategory } from './category-comparison.mjs';

let engine;

self.onmessage = async event => {
  try {
    const { catalog, options } = event.data ?? {};
    engine ??= await loadHighs({ locateFile: name => new URL(`vendor/${name}`, import.meta.url).href });
    const result = compareCategory(catalog, options, engine, (message, checked, total) => {
      self.postMessage({ type: 'progress', message, checked, total });
    });
    self.postMessage({ type: 'result', result });
  } catch (error) {
    self.postMessage({ type: 'error', message: error?.message || 'Category comparison failed.' });
  }
};
