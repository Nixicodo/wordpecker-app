import { DisciplineStatus } from '../types';

export const discoveryQuotaAssessments = ['familiar', 'uncertain', 'unknown'] as const;

export type DiscoveryQuotaAssessment = typeof discoveryQuotaAssessments[number];

export const discoveryQuotaLabels: Record<DiscoveryQuotaAssessment, string> = {
  familiar: '比较熟悉',
  uncertain: '不太熟悉',
  unknown: '完全陌生'
};

export const discoveryQuotaShortLabels: Record<DiscoveryQuotaAssessment, string> = {
  familiar: '熟',
  uncertain: '中',
  unknown: '陌'
};

export const formatDiscoveryQuotaSummary = (
  status: Pick<DisciplineStatus, 'remainingNewWordQuotaByAssessment'>
) => discoveryQuotaAssessments
  .map((assessment) => `${discoveryQuotaShortLabels[assessment]}${status.remainingNewWordQuotaByAssessment[assessment]}`)
  .join(' ');
