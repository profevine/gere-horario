import type { ScheduleEntry, Teacher } from '../types';
import { DAYS_OF_WEEK, PERIODS } from '../types';

function periodLabel(periodId: number): string {
  const active = PERIODS.filter(p => !p.isBreak);
  const idx = active.findIndex(p => p.id === periodId);
  return `${idx + 1}º período`;
}

export function checkSwapConflict(
  schedule: ScheduleEntry[],
  source: { classId: string; dayOfWeek: number; periodId: number; assignmentId: string },
  target: { classId: string; dayOfWeek: number; periodId: number; assignmentId: string },
  teachers: Teacher[]
): string | null {
  const teacherA = source.assignmentId?.split('|')[0];
  const teacherB = target.assignmentId?.split('|')[0];

  const isSource = (s: ScheduleEntry) =>
    s.classId === source.classId && s.dayOfWeek === source.dayOfWeek && s.periodId === source.periodId;
  const isTarget = (s: ScheduleEntry) =>
    s.classId === target.classId && s.dayOfWeek === target.dayOfWeek && s.periodId === target.periodId;

  if (teacherA) {
    const conflict = schedule.find(s =>
      !isSource(s) && !isTarget(s) &&
      s.dayOfWeek === target.dayOfWeek &&
      s.periodId === target.periodId &&
      s.assignmentId?.split('|')[0] === teacherA
    );
    if (conflict) {
      const name = teachers.find(t => t.id === teacherA)?.name ?? 'Professor';
      return `${name} já tem aula na ${DAYS_OF_WEEK[target.dayOfWeek]}, ${periodLabel(target.periodId)}.`;
    }
  }

  if (teacherB) {
    const conflict = schedule.find(s =>
      !isSource(s) && !isTarget(s) &&
      s.dayOfWeek === source.dayOfWeek &&
      s.periodId === source.periodId &&
      s.assignmentId?.split('|')[0] === teacherB
    );
    if (conflict) {
      const name = teachers.find(t => t.id === teacherB)?.name ?? 'Professor';
      return `${name} já tem aula na ${DAYS_OF_WEEK[source.dayOfWeek]}, ${periodLabel(source.periodId)}.`;
    }
  }

  return null;
}
