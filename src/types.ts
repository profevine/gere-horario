export interface Teacher {
  id: string;
  name: string;
  unavailableDays?: number[]; // 0: Seg, 1: Ter, etc.
}

export interface Subject {
  id: string;
  name: string;
  color?: string;
}

export interface SchoolClass {
  id: string;
  name: string;
}

export interface Assignment {
  teacherId: string;
  subjectId: string;
  classId: string;
  lessonsPerWeek: number;
}

export interface SchedulePeriod {
  id: number;
  startTime: string;
  endTime: string;
  isBreak?: boolean;
}

export interface ScheduleEntry {
  classId: string;
  periodId: number;
  dayOfWeek: number;
  assignmentId: string; // teacherId-subjectId
}

export const DAYS_OF_WEEK = [
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira"
];

export const PERIODS: SchedulePeriod[] = [
  { id: 1, startTime: "07:45", endTime: "08:35" },
  { id: 2, startTime: "08:35", endTime: "09:25" },
  { id: 3, startTime: "09:25", endTime: "10:15" },
  { id: 4, startTime: "10:15", endTime: "10:30", isBreak: true },
  { id: 5, startTime: "10:30", endTime: "11:15" },
  { id: 6, startTime: "11:15", endTime: "12:05" },
  { id: 7, startTime: "12:05", endTime: "13:00", isBreak: true },
  { id: 8, startTime: "13:00", endTime: "13:50" },
  { id: 9, startTime: "13:50", endTime: "14:40" },
  { id: 10, startTime: "14:40", endTime: "14:55", isBreak: true },
  { id: 11, startTime: "14:55", endTime: "15:45" },
  { id: 12, startTime: "15:45", endTime: "16:30" },
];
