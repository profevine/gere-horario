import { useDB } from './useDB';
import type { Teacher, Subject, SchoolClass, Assignment, ScheduleEntry } from '../types';

export function useSchoolData() {
  const [teachers, setTeachers, tl] = useDB<Teacher[]>('teachers', []);
  const [subjects, setSubjects, sl] = useDB<Subject[]>('subjects', []);
  const [classes, setClasses, cl] = useDB<SchoolClass[]>('classes', []);
  const [assignments, setAssignments, al] = useDB<Assignment[]>('assignments', []);
  const [orderedClassIds, setOrderedClassIds, ol] = useDB<string[]>('orderedClassIds', []);
  const [schedule, setSchedule, scl] = useDB<ScheduleEntry[]>('schedule', []);

  const isLoaded = tl && sl && cl && al && ol && scl;

  const addTeacher = (name: string) =>
    setTeachers(prev => [...prev, { id: crypto.randomUUID(), name }]);

  const addSubject = (name: string) =>
    setSubjects(prev => [...prev, { id: crypto.randomUUID(), name }]);

  const addClass = (name: string) => {
    const id = crypto.randomUUID();
    setClasses(prev => [...prev, { id, name }]);
    setOrderedClassIds(prev => [...prev, id]);
  };

  const addAssignment = (teacherId: string, subjectId: string, classId: string, lessonsPerWeek: number) =>
    setAssignments(prev => [...prev, { teacherId, subjectId, classId, lessonsPerWeek }]);

  return {
    teachers, subjects, classes, assignments, orderedClassIds, schedule, isLoaded,
    addTeacher, addSubject, addClass, addAssignment,
    setTeachers, setSubjects, setClasses, setAssignments, setOrderedClassIds, setSchedule,
  };
}
