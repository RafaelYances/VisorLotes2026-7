import type { Project, ProjectCard } from '../src/types';

export type ProcessedPlan = Pick<
  Project,
  'location' | 'bounds' | 'stats' | 'affine' | 'lots' | 'manzanas' | 'roads' | 'greens' | 'labels' | 'pois'
>;

export function normalizeLotKey(name: string): string | null;
export function processCad(
  dxfText: string,
  opts?: {
    zone?: number;
    hemisphere?: 'north' | 'south';
    prices?: Map<string, { status: string; price: number | null }>;
    location?: Partial<Project['location']>;
  },
): { plan: ProcessedPlan; preview: ProjectCard['preview']; warnings: string[] };
