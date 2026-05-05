import { wrap, type Remote } from 'comlink';
import type { TerrainWorkerAPI } from './terrain.worker';

let workerInstance: Worker | null = null;
let api: Remote<TerrainWorkerAPI> | null = null;

export function getTerrainApi(): Remote<TerrainWorkerAPI> {
  if (!api) {
    workerInstance = new Worker(new URL('./terrain.worker.ts', import.meta.url), { type: 'module' });
    api = wrap<TerrainWorkerAPI>(workerInstance);
  }
  return api;
}
