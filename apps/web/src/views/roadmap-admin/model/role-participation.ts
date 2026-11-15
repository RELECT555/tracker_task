import type { RoadmapRole, RoadmapRoleMemberAllocation } from '@/entities/roadmap/api/roadmapApi';

export type RoleMemberDraft = { personExternalId: string; allocationPercent: string };

export function equalRoleParticipation(personIds: string[]): RoleMemberDraft[] {
  const ids = [...new Set(personIds)];
  if (!ids.length) return [];
  const share = Math.floor(10000 / ids.length);
  const remainder = 10000 % ids.length;
  return ids.map((personExternalId, index) => ({
    personExternalId,
    allocationPercent: String((share + (index < remainder ? 1 : 0)) / 100),
  }));
}

export function initialRoleParticipation(role?: RoadmapRole): RoleMemberDraft[] {
  const ids = (role?.members ?? []).map((member) => member.personExternalId);
  if (role?.defaultPersonExternalId && !ids.includes(role.defaultPersonExternalId)) ids.push(role.defaultPersonExternalId);
  const equal = equalRoleParticipation(ids);
  return equal.map((member) => ({
    ...member,
    allocationPercent: String(role?.members?.find((saved) => saved.personExternalId === member.personExternalId)?.allocationPercent ?? member.allocationPercent),
  }));
}

export function parseRoleParticipation(members: RoleMemberDraft[]): {
  allocations: RoadmapRoleMemberAllocation[];
  total: number;
  valid: boolean;
} {
  let valid = true;
  let totalUnits = 0;
  const allocations = members.map((member) => {
    const value = member.allocationPercent.trim().replace(',', '.');
    const allocationPercent = Number(value);
    const units = Math.round(allocationPercent * 100);
    if (!value || !Number.isFinite(allocationPercent) || allocationPercent < 0 || allocationPercent > 100
      || Math.abs(allocationPercent * 100 - units) > 1e-8) valid = false;
    if (Number.isFinite(units)) totalUnits += units;
    return { personExternalId: member.personExternalId, allocationPercent };
  });
  return { allocations, total: totalUnits / 100, valid: valid && (!members.length || totalUnits === 10000) };
}
