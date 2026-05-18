import type { Teacher, Subject, SchoolClass, Assignment } from '../types';
import { useLocalStorage } from './useLocalStorage';

export function useSchoolData() {
  const [teachers, setTeachers] = useLocalStorage<Teacher[]>('teachers', []);
  const [subjects, setSubjects] = useLocalStorage<Subject[]>('subjects', []);
  const [classes, setClasses] = useLocalStorage<SchoolClass[]>('classes', []);
  const [assignments, setAssignments] = useLocalStorage<Assignment[]>('assignments', []);
  const [orderedClassIds, setOrderedClassIds] = useLocalStorage<string[]>('orderedClassIds', []);

  const addTeacher = (name: string) => {
    const newTeacher = { id: crypto.randomUUID(), name };
    setTeachers([...teachers, newTeacher]);
  };

  const addSubject = (name: string, color?: string) => {
    const newSubject = { id: crypto.randomUUID(), name, color };
    setSubjects([...subjects, newSubject]);
  };

  const addClass = (name: string) => {
    const newId = crypto.randomUUID();
    const newClass = { id: newId, name };
    setClasses([...classes, newClass]);
    setOrderedClassIds([...orderedClassIds, newId]);
  };

  const addAssignment = (teacherId: string, subjectId: string, classId: string, lessonsPerWeek: number) => {
    const newAssignment = { teacherId, subjectId, classId, lessonsPerWeek };
    setAssignments([...assignments, newAssignment]);
  };

  return {
    teachers, subjects, classes, assignments, orderedClassIds,
    addTeacher, addSubject, addClass, addAssignment,
    setTeachers, setSubjects, setClasses, setAssignments, setOrderedClassIds
  };
}
