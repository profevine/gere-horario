import type { Assignment, ScheduleEntry, Teacher } from '../types';
import { PERIODS } from '../types';

export function generateSchedule(
  assignments: Assignment[],
  classes: { id: string }[],
  teachers: Teacher[]
): ScheduleEntry[] {
  const schedule: ScheduleEntry[] = [];
  const teacherAvailability: Record<string, Set<string>> = {}; 
  const classAvailability: Record<string, Set<string>> = {};

  const activePeriods = PERIODS.filter(p => !p.isBreak).map(p => p.id);
  const days = [0, 1, 2, 3, 4];

  const remainingAssignments = assignments.map(a => ({ ...a }));
  const shuffledClasses = [...classes].sort(() => Math.random() - 0.5);

  for (const day of days) {
    for (const periodId of activePeriods) {
      const slotKey = `${day}-${periodId}`;
      
      for (const cls of shuffledClasses) {
        const assignmentIndex = remainingAssignments.findIndex(a => {
          if (a.classId !== cls.id || a.lessonsPerWeek <= 0) return false;

          const teacher = teachers.find(t => t.id === a.teacherId);
          if (!teacher) return false;

          if (teacher.unavailableDays?.includes(day)) return false;
          if (teacherAvailability[teacher.id]?.has(slotKey)) return false;
          if (classAvailability[cls.id]?.has(slotKey)) return false;

          // Max 2 consecutivas
          const prevIdx = activePeriods.indexOf(periodId) - 1;
          if (prevIdx >= 0) {
            const prevId = activePeriods[prevIdx];
            const hasPrev = schedule.some(s => s.dayOfWeek === day && s.periodId === prevId && s.assignmentId.startsWith(teacher.id));
            if (hasPrev) {
              const prevPrevIdx = prevIdx - 1;
              if (prevPrevIdx >= 0) {
                const prevPrevId = activePeriods[prevPrevIdx];
                const hasPrevPrev = schedule.some(s => s.dayOfWeek === day && s.periodId === prevPrevId && s.assignmentId.startsWith(teacher.id));
                if (hasPrevPrev) return false;
              }
            }
          }

          return true;
        });

        if (assignmentIndex !== -1) {
          const assignment = remainingAssignments[assignmentIndex];
          schedule.push({ classId: cls.id, periodId, dayOfWeek: day, assignmentId: `${assignment.teacherId}|${assignment.subjectId}` });
          if (!teacherAvailability[assignment.teacherId]) teacherAvailability[assignment.teacherId] = new Set();
          teacherAvailability[assignment.teacherId].add(slotKey);
          if (!classAvailability[cls.id]) classAvailability[cls.id] = new Set();
          classAvailability[cls.id].add(slotKey);
          assignment.lessonsPerWeek--;
        }
      }
    }
  }

  return schedule;
}
