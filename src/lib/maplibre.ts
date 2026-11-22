/**
 * MapLibre GL 6 carga su "worker" (procesa los mapas en segundo plano) desde un archivo aparte.
 * Vite lo copia a /assets con nombre único y aquí se le indica a MapLibre dónde está.
 */
import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

maplibregl.setWorkerUrl(workerUrl);

export { maplibregl };
