import { useState, useRef, useEffect } from 'react';
import { useSchoolData } from './hooks/useSchoolData';
import { PERIODS, DAYS_OF_WEEK } from './types';
import type { ScheduleEntry, Teacher, Subject } from './types';
import { generateSchedule } from './utils/scheduler';
import { checkSwapConflict } from './utils/conflictChecker';
import { dbClear } from './db/schoolDB';
import {
  Users, BookOpen, GraduationCap, Plus, Trash2, Play, Eraser,
  Database, FileDown, Printer, GripVertical, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { clsx } from 'clsx';
import type { ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import logo from './assets/logo.png';

import {
  DndContext,
  closestCenter,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Cabeçalho de Turma Arrastável (para impressão) ───────────────────────────
function SortableHeader({ id, name }: { id: string; name: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, data: { type: 'class' } });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 50 : 'auto', opacity: isDragging ? 0.5 : 1 };
  return (
    <th ref={setNodeRef} style={style} className="bg-[#1f2937] text-white p-0 rounded-xl font-black uppercase tracking-widest shadow-sm group min-w-[110px]">
      <div className="flex flex-col items-center py-2 px-1 relative">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 hover:bg-white/10 rounded transition-colors mb-1 no-print">
          <GripVertical size={14} className="text-white/40 group-hover:text-white/80" />
        </div>
        <span className="text-[10px] pb-2 px-2 text-center">{name}</span>
      </div>
    </th>
  );
}

// ─── Célula da grade semanal ───────────────────────────────────────────────────
function WeekCell({
  cellId, entry, teacher, subject, disabled,
}: {
  cellId: string;
  entry: { classId: string; dayOfWeek: number; periodId: number; assignmentId: string };
  teacher?: Teacher;
  subject?: Subject;
  disabled?: boolean;
}) {
  const isEmpty = !entry.assignmentId;

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: cellId,
    disabled: isEmpty || disabled,
    data: { type: 'lesson', entry },
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: cellId,
    disabled,
    data: { type: 'lesson', entry },
  });

  const ref = (node: HTMLDivElement | null) => {
    setDragRef(node);
    setDropRef(node);
  };

  return (
    <div
      ref={ref}
      {...(!isEmpty ? { ...attributes, ...listeners } : {})}
      className={cn(
        'flex flex-col gap-0.5 p-1.5 rounded-lg border-2 transition-all h-full min-h-[52px] justify-center select-none',
        isEmpty
          ? 'bg-gray-50 border-dashed border-gray-200'
          : 'bg-white border-transparent hover:border-[#2e7d32]/40 cursor-grab active:cursor-grabbing shadow-sm',
        isDragging && 'opacity-20',
        isOver && !isEmpty && 'border-blue-400 bg-blue-50 scale-[1.02]',
        isOver && isEmpty && 'border-blue-300 bg-blue-50',
      )}
    >
      {!isEmpty ? (
        <>
          <span className="text-[9px] text-[#dc2626] font-black uppercase leading-tight truncate">{teacher?.name ?? '---'}</span>
          <div className="h-px bg-gray-100 w-1/2 mx-auto" />
          <span className="text-[9px] text-[#1b5e20] font-black uppercase truncate">{subject?.name ?? '---'}</span>
        </>
      ) : (
        <span className="text-[9px] text-gray-300 text-center">—</span>
      )}
    </div>
  );
}

// ─── Miniatura para DragOverlay ────────────────────────────────────────────────
function DragPreview({ teacher, subject }: { teacher?: Teacher; subject?: Subject }) {
  return (
    <div className="flex flex-col gap-0.5 p-2 rounded-lg bg-white border-2 border-[#2e7d32] shadow-2xl w-[90px] opacity-95 rotate-2">
      <span className="text-[9px] text-[#dc2626] font-black uppercase truncate">{teacher?.name ?? '---'}</span>
      <div className="h-px bg-gray-100" />
      <span className="text-[9px] text-[#1b5e20] font-black uppercase truncate">{subject?.name ?? '---'}</span>
    </div>
  );
}

const activePeriods = PERIODS.filter(p => !p.isBreak);

export default function App() {
  const {
    teachers, subjects, classes, assignments, orderedClassIds, schedule, isLoaded,
    addTeacher, addSubject, addClass, addAssignment,
    setTeachers, setSubjects, setClasses, setAssignments, setOrderedClassIds, setSchedule,
  } = useSchoolData();

  const [activeTab, setActiveTab] = useState<'setup' | 'schedule'>('setup');
  const [currentDay, setCurrentDay] = useState(0);
  const [printMode, setPrintMode] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [activeDrag, setActiveDrag] = useState<{ teacher?: Teacher; subject?: Subject } | null>(null);
  const scheduleRef = useRef<HTMLDivElement>(null);

  // Mantém orderedClassIds sincronizado quando turmas são adicionadas/removidas
  useEffect(() => {
    if (!isLoaded || classes.length === 0) return;
    const classIds = classes.map(c => c.id);
    const synced = [
      ...orderedClassIds.filter(id => classIds.includes(id)),
      ...classIds.filter(id => !orderedClassIds.includes(id)),
    ];
    if (synced.length !== orderedClassIds.length || synced.some((id, i) => id !== orderedClassIds[i])) {
      setOrderedClassIds(synced);
    }
  }, [classes, isLoaded]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // ─── Cadastro ───────────────────────────────────────────────────────────────
  const [newTeacher, setNewTeacher] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [newClass, setNewClass] = useState('');
  const [asgnTeacher, setAsgnTeacher] = useState('');
  const [asgnSubject, setAsgnSubject] = useState('');
  const [asgnClass, setAsgnClass] = useState('');
  const [asgnLessons, setAsgnLessons] = useState(1);

  const toggleTeacherDay = (teacherId: string, day: number) => {
    setTeachers(prev => prev.map(t => {
      if (t.id !== teacherId) return t;
      const days = t.unavailableDays ?? [];
      return { ...t, unavailableDays: days.includes(day) ? days.filter(d => d !== day) : [...days, day] };
    }));
  };

  // ─── Geração ─────────────────────────────────────────────────────────────────
  const handleGenerate = () => {
    if (assignments.length === 0 || classes.length === 0) {
      alert('Por favor, adicione turmas e atribuições de aulas.');
      return;
    }
    setSchedule(generateSchedule(assignments, classes, teachers));
    setActiveTab('schedule');
  };

  const clearAllData = () => {
    if (!confirm('Deseja realmente apagar todos os dados?')) return;
    setTeachers([]); setSubjects([]); setClasses([]); setAssignments([]);
    setSchedule([]); setOrderedClassIds([]);
    dbClear();
  };

  const loadDemoData = () => {
    const dTeachers = [
      { id: 't1', name: 'Joarice', unavailableDays: [4] },
      { id: 't2', name: 'Natasha', unavailableDays: [0] },
      { id: 't3', name: 'Elenir' }, { id: 't4', name: 'Anajara' },
      { id: 't5', name: 'Silvia' }, { id: 't6', name: 'James' },
      { id: 't7', name: 'Maicon' }, { id: 't8', name: 'Sonia' },
    ];
    const dSubjects = [
      { id: 's1', name: 'MAT' }, { id: 's2', name: 'LP' },
      { id: 's3', name: 'ARTE' }, { id: 's4', name: 'HIST' },
      { id: 's5', name: 'EF' }, { id: 's6', name: 'GEO' },
    ];
    const dClasses = [
      { id: 'c1', name: '10/20/30' }, { id: 'c2', name: '40/50' },
      { id: 'c3', name: '80' }, { id: 'c4', name: '100' }, { id: 'c5', name: '200' },
    ];
    const dAssignments = [
      { teacherId: 't1', subjectId: 's1', classId: 'c1', lessonsPerWeek: 5 },
      { teacherId: 't2', subjectId: 's1', classId: 'c2', lessonsPerWeek: 5 },
      { teacherId: 't3', subjectId: 's2', classId: 'c3', lessonsPerWeek: 5 },
      { teacherId: 't4', subjectId: 's3', classId: 'c4', lessonsPerWeek: 3 },
      { teacherId: 't5', subjectId: 's2', classId: 'c5', lessonsPerWeek: 5 },
      { teacherId: 't6', subjectId: 's6', classId: 'c1', lessonsPerWeek: 3 },
      { teacherId: 't7', subjectId: 's5', classId: 'c2', lessonsPerWeek: 2 },
      { teacherId: 't8', subjectId: 's4', classId: 'c3', lessonsPerWeek: 3 },
    ];
    setTeachers(dTeachers); setSubjects(dSubjects); setClasses(dClasses);
    setAssignments(dAssignments); setOrderedClassIds(dClasses.map(c => c.id));
    alert('Dados de demonstração carregados!');
  };

  // ─── PDF ──────────────────────────────────────────────────────────────────────
  const exportPDF = async () => {
    setPrintMode(true);
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    for (let day = 0; day < 5; day++) {
      setCurrentDay(day);
      await new Promise(r => setTimeout(r, 700));
      if (scheduleRef.current) {
        const canvas = await html2canvas(scheduleRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
        const imgData = canvas.toDataURL('image/png');
        const imgProps = pdf.getImageProperties(imgData);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
        if (day > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      }
    }
    pdf.save('Horario_Achilino.pdf');
    setPrintMode(false);
  };

  // ─── Drag & Drop ─────────────────────────────────────────────────────────────
  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.type === 'lesson') {
      const entry = data.entry as ScheduleEntry;
      setActiveDrag({
        teacher: teachers.find(t => t.id === entry.assignmentId?.split('|')[0]),
        subject: subjects.find(s => s.id === entry.assignmentId?.split('|')[1]),
      });
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeType = active.data.current?.type;
    const overType = over.data.current?.type;

    // Reordenar colunas de turma (modo impressão)
    if (activeType === 'class' && overType === 'class') {
      const oldIndex = orderedClassIds.indexOf(active.id as string);
      const newIndex = orderedClassIds.indexOf(over.id as string);
      if (oldIndex !== -1 && newIndex !== -1)
        setOrderedClassIds(arrayMove(orderedClassIds, oldIndex, newIndex));
      return;
    }

    // Trocar aulas na grade semanal
    if (activeType === 'lesson' && overType === 'lesson') {
      const srcData = active.data.current!.entry as ScheduleEntry;
      const dstData = over.data.current!.entry as ScheduleEntry;

      const srcEntry = schedule.find(s =>
        s.classId === srcData.classId && s.dayOfWeek === srcData.dayOfWeek && s.periodId === srcData.periodId,
      );
      if (!srcEntry) return;

      const dstEntry = schedule.find(s =>
        s.classId === dstData.classId && s.dayOfWeek === dstData.dayOfWeek && s.periodId === dstData.periodId,
      );

      const targetForCheck = dstEntry ?? { ...dstData, assignmentId: '' };
      const conflict = checkSwapConflict(schedule, srcEntry, targetForCheck, teachers);
      if (conflict) {
        setConflictError(conflict);
        setTimeout(() => setConflictError(null), 4000);
        return;
      }

      setSchedule(prev => {
        const next = prev.map(s => ({ ...s }));
        const idxA = next.findIndex(s =>
          s.classId === srcData.classId && s.dayOfWeek === srcData.dayOfWeek && s.periodId === srcData.periodId,
        );
        if (dstEntry) {
          const idxB = next.findIndex(s =>
            s.classId === dstData.classId && s.dayOfWeek === dstData.dayOfWeek && s.periodId === dstData.periodId,
          );
          const tmp = next[idxA].assignmentId;
          next[idxA].assignmentId = next[idxB].assignmentId;
          next[idxB].assignmentId = tmp;
        } else {
          // Mover para célula vazia: atualiza o slot da entrada
          next[idxA] = { ...next[idxA], classId: dstData.classId, dayOfWeek: dstData.dayOfWeek, periodId: dstData.periodId };
        }
        return next;
      });
    }
  };

  const displayedClasses = orderedClassIds.map(id => classes.find(c => c.id === id)).filter(Boolean) as typeof classes;

  // ─── Loading ─────────────────────────────────────────────────────────────────
  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-[#f1f8e9] flex items-center justify-center">
        <div className="text-[#2e7d32] font-black uppercase tracking-widest text-sm animate-pulse">Carregando...</div>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen w-full bg-[#f1f8e9] flex flex-col font-sans">
      {/* Toast de conflito */}
      {conflictError && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white px-5 py-3 rounded-2xl shadow-2xl text-xs font-black uppercase tracking-wider animate-bounce">
          ⚠ {conflictError}
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b-4 border-[#2e7d32] px-6 py-3 flex justify-between items-center shadow-md no-print">
        <div className="flex items-center gap-4">
          <img src={logo} alt="Logo" className="h-16 w-16 object-contain" />
          <div>
            <h1 className="text-xl font-black text-[#1b5e20] uppercase tracking-tight">E.T.E. Achilino de Santis</h1>
            <p className="text-[10px] font-bold text-[#f9a825] uppercase tracking-[0.2em]">Santo Antônio das Missões - RS</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-4">
            <button onClick={loadDemoData} className="text-[10px] font-black text-[#065f46] bg-[#ecfdf5] px-2 py-1 rounded border border-[#d1fae5] shadow-sm cursor-pointer">
              <Database size={12} className="inline mr-1" /> DEMO
            </button>
            <button onClick={clearAllData} className="text-[10px] font-black text-[#dc2626] bg-[#fef2f2] px-2 py-1 rounded border border-[#fee2e2] shadow-sm cursor-pointer">
              <Eraser size={12} className="inline mr-1" /> LIMPAR
            </button>
          </div>
          <nav className="flex gap-1 bg-[#f3f4f6] p-1 rounded-lg border border-[#e5e7eb]">
            <button onClick={() => setActiveTab('setup')} className={cn('px-5 py-2 rounded-md text-xs font-black uppercase transition-all cursor-pointer', activeTab === 'setup' ? 'bg-[#2e7d32] text-white' : 'text-gray-500')}>
              Cadastro
            </button>
            <button onClick={() => setActiveTab('schedule')} className={cn('px-5 py-2 rounded-md text-xs font-black uppercase transition-all cursor-pointer', activeTab === 'schedule' ? 'bg-[#2e7d32] text-white' : 'text-gray-500')}>
              Horário
            </button>
          </nav>
        </div>
      </header>

      <main className="flex-1 p-6 overflow-auto max-w-[1600px] mx-auto w-full">

        {/* ── ABA CADASTRO ─────────────────────────────────────────────────── */}
        {activeTab === 'setup' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-6">
              {/* Professores */}
              <section className="bg-white p-6 rounded-2xl shadow-sm border-t-4 border-[#2e7d32]">
                <h2 className="text-sm font-black text-gray-700 mb-4 flex items-center gap-2 uppercase tracking-widest">
                  <Users size={18} className="text-[#2e7d32]" /> Professores
                </h2>
                <div className="flex gap-2 mb-4">
                  <input
                    type="text" value={newTeacher} onChange={e => setNewTeacher(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && newTeacher) { addTeacher(newTeacher); setNewTeacher(''); } }}
                    placeholder="Nome do docente"
                    className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm"
                  />
                  <button onClick={() => { if (newTeacher) { addTeacher(newTeacher); setNewTeacher(''); } }} className="bg-[#2e7d32] text-white px-4 rounded-xl hover:bg-[#1b5e20] cursor-pointer">
                    <Plus size={20} />
                  </button>
                </div>
                <div className="space-y-3 max-h-80 overflow-auto pr-2 custom-scrollbar">
                  {teachers.map(t => (
                    <div key={t.id} className="p-4 bg-[#f1f8e9] rounded-xl border border-[#c8e6c9] space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="font-black text-gray-700 uppercase text-xs">{t.name}</span>
                        <button onClick={() => setTeachers(teachers.filter(x => x.id !== t.id))} className="text-red-400 hover:text-red-600 cursor-pointer"><Trash2 size={16} /></button>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <span className="text-[9px] font-black text-gray-400 uppercase mr-2 mt-1">Dias off:</span>
                        {DAYS_OF_WEEK.map((day, idx) => (
                          <button key={idx} onClick={() => toggleTeacherDay(t.id, idx)}
                            className={cn('px-2 py-0.5 rounded-full text-[9px] font-black uppercase transition-all cursor-pointer border',
                              t.unavailableDays?.includes(idx) ? 'bg-red-500 text-white border-red-600' : 'bg-white text-gray-400 border-gray-200')}>
                            {day.slice(0, 3)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Disciplinas */}
              <section className="bg-white p-6 rounded-2xl shadow-sm border-t-4 border-[#fbc02d]">
                <h2 className="text-sm font-black text-gray-700 mb-4 flex items-center gap-2 uppercase tracking-widest">
                  <BookOpen size={18} className="text-[#f9a825]" /> Disciplinas
                </h2>
                <div className="flex gap-2 mb-4">
                  <input
                    type="text" value={newSubject} onChange={e => setNewSubject(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && newSubject) { addSubject(newSubject); setNewSubject(''); } }}
                    placeholder="Ex: MAT, LP..."
                    className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm"
                  />
                  <button onClick={() => { if (newSubject) { addSubject(newSubject); setNewSubject(''); } }} className="bg-[#fbc02d] text-white px-4 rounded-xl hover:bg-[#f9a825] cursor-pointer">
                    <Plus size={20} />
                  </button>
                </div>
                <ul className="space-y-2 max-h-40 overflow-auto pr-2 custom-scrollbar">
                  {subjects.map(s => (
                    <li key={s.id} className="flex justify-between items-center px-4 py-2.5 bg-[#fffde7] rounded-xl text-xs font-black text-gray-700 border border-[#fff9c4] uppercase">
                      {s.name}
                      <button onClick={() => setSubjects(subjects.filter(x => x.id !== s.id))} className="text-red-400 hover:text-red-600 cursor-pointer"><Trash2 size={16} /></button>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Turmas */}
              <section className="bg-white p-6 rounded-2xl shadow-sm border-t-4 border-[#1b5e20]">
                <h2 className="text-sm font-black text-gray-700 mb-4 flex items-center gap-2 uppercase tracking-widest">
                  <GraduationCap size={18} className="text-[#1b5e20]" /> Turmas
                </h2>
                <div className="flex gap-2 mb-4">
                  <input
                    type="text" value={newClass} onChange={e => setNewClass(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && newClass) { addClass(newClass); setNewClass(''); } }}
                    placeholder="Ex: 101, 80..."
                    className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm"
                  />
                  <button onClick={() => { if (newClass) { addClass(newClass); setNewClass(''); } }} className="bg-[#1b5e20] text-white px-4 rounded-xl hover:bg-[#0a3d0a] cursor-pointer">
                    <Plus size={20} />
                  </button>
                </div>
                <ul className="space-y-2 max-h-40 overflow-auto pr-2 custom-scrollbar">
                  {classes.map(c => (
                    <li key={c.id} className="flex justify-between items-center px-4 py-2.5 bg-gray-50 rounded-xl text-xs font-black text-gray-700 border border-gray-200 uppercase">
                      {c.name}
                      <button onClick={() => setClasses(classes.filter(x => x.id !== c.id))} className="text-red-400 hover:text-red-600 cursor-pointer"><Trash2 size={16} /></button>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            {/* Atribuições */}
            <div>
              <section className="bg-white p-6 rounded-2xl shadow-xl border border-gray-100 h-full flex flex-col">
                <h2 className="text-sm font-black text-gray-700 mb-6 uppercase border-b pb-4">Atribuições de Aulas</h2>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Docente</label>
                    <select value={asgnTeacher} onChange={e => setAsgnTeacher(e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm cursor-pointer uppercase font-black">
                      <option value="">Selecione...</option>
                      {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Matéria</label>
                    <select value={asgnSubject} onChange={e => setAsgnSubject(e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm cursor-pointer uppercase font-black">
                      <option value="">Selecione...</option>
                      {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Turma</label>
                    <select value={asgnClass} onChange={e => setAsgnClass(e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm cursor-pointer uppercase font-black">
                      <option value="">Selecione...</option>
                      {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Aulas/Semana</label>
                    <input type="number" min="1" max="10" value={asgnLessons} onChange={e => setAsgnLessons(Number(e.target.value))} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-black" />
                  </div>
                </div>
                <button
                  onClick={() => { if (asgnTeacher && asgnSubject && asgnClass) addAssignment(asgnTeacher, asgnSubject, asgnClass, asgnLessons); }}
                  className="w-full bg-[#2e7d32] text-white py-3 rounded-xl hover:bg-[#1b5e20] font-black uppercase text-xs flex justify-center items-center gap-2 mb-8 shadow-lg cursor-pointer"
                >
                  <Plus size={18} /> Registrar Atribuição
                </button>

                <div className="flex-1 border-t pt-6">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Grade Configurada</h3>
                  <div className="space-y-3 max-h-80 overflow-auto pr-2 custom-scrollbar">
                    {assignments.map((a, i) => (
                      <div key={i} className="flex justify-between items-center p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-[#1b5e20] uppercase">{teachers.find(t => t.id === a.teacherId)?.name}</span>
                            <span className="text-xs font-bold text-[#f9a825] uppercase">{subjects.find(s => s.id === a.subjectId)?.name}</span>
                          </div>
                          <div className="text-[10px] font-black text-gray-400">Turma: {classes.find(c => c.id === a.classId)?.name}</div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="bg-[#e8f5e9] text-[#2e7d32] px-2.5 py-1 rounded-lg text-[10px] font-black">{a.lessonsPerWeek}x</span>
                          <button onClick={() => setAssignments(assignments.filter((_, idx) => idx !== i))} className="text-gray-300 hover:text-red-500 cursor-pointer"><Trash2 size={16} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {assignments.length > 0 && (
                  <button onClick={handleGenerate} className="w-full mt-8 bg-[#2e7d32] text-white py-4 rounded-2xl font-black uppercase tracking-widest text-sm flex justify-center items-center gap-3 shadow-xl cursor-pointer hover:bg-[#1b5e20]">
                    <Play size={22} fill="currentColor" /> Gerar Horário Completo
                  </button>
                )}
              </section>
            </div>
          </div>
        )}

        {/* ── ABA HORÁRIO ──────────────────────────────────────────────────── */}
        {activeTab === 'schedule' && (
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex justify-between items-center no-print flex-wrap gap-3">
              <div className="flex items-center gap-3">
                {printMode ? (
                  <>
                    <button onClick={() => setCurrentDay(Math.max(0, currentDay - 1))} disabled={currentDay === 0} className="p-2 bg-white rounded-full shadow hover:bg-gray-100 disabled:opacity-30 cursor-pointer"><ChevronLeft /></button>
                    <span className="text-lg font-black text-[#1b5e20] uppercase tracking-widest">{DAYS_OF_WEEK[currentDay]}</span>
                    <button onClick={() => setCurrentDay(Math.min(4, currentDay + 1))} disabled={currentDay === 4} className="p-2 bg-white rounded-full shadow hover:bg-gray-100 disabled:opacity-30 cursor-pointer"><ChevronRight /></button>
                    <button onClick={() => setPrintMode(false)} className="ml-4 text-xs font-black text-gray-500 underline cursor-pointer">← Voltar à semana</button>
                  </>
                ) : (
                  <h3 className="text-lg font-black text-[#1b5e20] uppercase tracking-widest">Grade Semanal</h3>
                )}
              </div>
              <div className="flex gap-2">
                {!printMode && (
                  <button onClick={() => setPrintMode(true)} className="bg-white border border-gray-200 text-gray-600 px-4 py-2.5 rounded-xl font-black uppercase text-xs tracking-widest flex items-center gap-2 hover:bg-gray-50 shadow-sm cursor-pointer">
                    <Printer size={16} /> Modo Impressão
                  </button>
                )}
                <button onClick={exportPDF} className="bg-[#2e7d32] text-white px-6 py-2.5 rounded-xl font-black uppercase text-xs tracking-widest flex items-center gap-2 hover:bg-[#1b5e20] shadow-lg cursor-pointer">
                  <FileDown size={18} /> Exportar PDF
                </button>
                {printMode && (
                  <button onClick={() => window.print()} className="bg-gray-800 text-white px-6 py-2.5 rounded-xl font-black uppercase text-xs tracking-widest flex items-center gap-2 hover:bg-black shadow-lg cursor-pointer">
                    <Printer size={18} /> Imprimir
                  </button>
                )}
              </div>
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={() => setActiveDrag(null)}
            >
              {/* ── VISÃO SEMANAL (edição) ── */}
              {!printMode && (
                <div className="bg-white p-6 rounded-3xl shadow-xl border border-gray-100 overflow-x-auto">
                  <div className="flex items-center justify-between mb-6 border-b pb-4">
                    <div className="flex items-center gap-4">
                      <img src={logo} alt="Logo" className="h-14 w-14 object-contain" />
                      <div>
                        <p className="text-base font-black text-[#1b5e20] uppercase tracking-tight">E.T.E. Achilino de Santis</p>
                        <p className="text-[10px] font-bold text-[#f9a825] uppercase">Grade Horária 2026 — Arraste para trocar aulas</p>
                      </div>
                    </div>
                  </div>

                  <table className="border-separate border-spacing-1 text-[9px]" style={{ minWidth: `${120 + displayedClasses.length * 5 * 76}px` }}>
                    <thead>
                      {/* Linha com nomes dos dias */}
                      <tr>
                        <th rowSpan={2} className="w-[110px] bg-[#1b5e20] text-white p-3 rounded-xl font-black uppercase tracking-widest text-[10px]">
                          Horário
                        </th>
                        {DAYS_OF_WEEK.map((day, di) => (
                          <th key={di} colSpan={displayedClasses.length}
                            className="bg-[#2e7d32] text-white px-2 py-2 rounded-xl font-black uppercase tracking-wider text-[10px] text-center">
                            {day}
                          </th>
                        ))}
                      </tr>
                      {/* Sub-header com nomes das turmas */}
                      <tr>
                        {DAYS_OF_WEEK.map((_, di) =>
                          displayedClasses.map(cls => (
                            <th key={`${di}-${cls.id}`} className="bg-[#1f2937] text-white px-1 py-1.5 rounded-lg font-black uppercase text-[9px] min-w-[72px] text-center">
                              {cls.name}
                            </th>
                          ))
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {PERIODS.map((period, _pi) => {
                        const periodIdx = activePeriods.findIndex(p => p.id === period.id);
                        if (period.isBreak) {
                          return (
                            <tr key={period.id}>
                              <td className="p-2 bg-gray-50 rounded-xl font-black text-gray-400 text-center text-[9px] border border-dashed border-gray-200">
                                {period.startTime}–{period.endTime}
                              </td>
                              <td colSpan={displayedClasses.length * 5} className="p-2 bg-[#fffde7] rounded-xl text-center text-[9px] font-black text-[#f9a825] uppercase tracking-[0.5em] border border-[#fff9c4]">
                                {period.startTime === '10:15' || period.startTime === '14:40' ? 'R E C R E I O' : 'I N T E R V A L O'}
                              </td>
                            </tr>
                          );
                        }
                        return (
                          <tr key={period.id}>
                            <td className="p-2 bg-white rounded-xl font-black text-gray-600 text-center border border-gray-100 shadow-sm">
                              <div className="text-[13px] text-[#2e7d32]">{periodIdx + 1}º</div>
                              <div className="text-[8px] opacity-60">{period.startTime}–{period.endTime}</div>
                            </td>
                            {DAYS_OF_WEEK.map((_, day) =>
                              displayedClasses.map(cls => {
                                const entry = schedule.find(s => s.classId === cls.id && s.periodId === period.id && s.dayOfWeek === day);
                                const cellId = `${cls.id}|${day}|${period.id}`;
                                const cellEntry = { classId: cls.id, dayOfWeek: day, periodId: period.id, assignmentId: entry?.assignmentId ?? '' };
                                return (
                                  <td key={cellId} className="p-0.5 bg-gray-50/50 rounded-lg">
                                    <WeekCell
                                      cellId={cellId}
                                      entry={cellEntry}
                                      teacher={entry ? teachers.find(t => t.id === entry.assignmentId.split('|')[0]) : undefined}
                                      subject={entry ? subjects.find(s => s.id === entry.assignmentId.split('|')[1]) : undefined}
                                    />
                                  </td>
                                );
                              })
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── VISÃO DIÁRIA (impressão/PDF) ── */}
              {printMode && (
                <div ref={scheduleRef} className="bg-white p-8 rounded-3xl shadow-2xl border border-gray-100 overflow-x-auto print:shadow-none print:p-4">
                  <div className="flex justify-between items-end mb-8 border-b-2 border-gray-50 pb-6">
                    <div className="flex items-center gap-6">
                      <img src={logo} alt="Logo" className="h-20 w-20 object-contain" />
                      <div>
                        <h2 className="text-2xl font-black text-[#1b5e20] uppercase leading-none tracking-tighter">{DAYS_OF_WEEK[currentDay]}</h2>
                        <p className="text-xs font-bold text-[#f9a825] uppercase mt-1">E.T.E. Achilino de Santis — Santo Antônio das Missões</p>
                      </div>
                    </div>
                    <div className="bg-[#e8f5e9] px-4 py-2 rounded-xl border border-[#c8e6c9] text-[10px] font-black text-[#2e7d32] uppercase tracking-widest">Grade Horária 2026</div>
                  </div>

                  <SortableContext items={displayedClasses.map(c => c.id)} strategy={horizontalListSortingStrategy}>
                    <table className="w-full border-separate border-spacing-1 text-[10px] min-w-[900px]">
                      <thead>
                        <tr>
                          <th className="w-32 bg-[#1b5e20] text-white p-4 rounded-xl font-black uppercase tracking-widest">Horário</th>
                          {displayedClasses.map(cls => <SortableHeader key={cls.id} id={cls.id} name={cls.name} />)}
                        </tr>
                      </thead>
                      <tbody>
                        {PERIODS.map(period => {
                          const periodIdx = activePeriods.findIndex(p => p.id === period.id);
                          if (period.isBreak) {
                            return (
                              <tr key={period.id}>
                                <td className="p-3 bg-gray-50 rounded-xl font-black text-gray-400 text-center border border-dashed border-gray-200">{period.startTime}–{period.endTime}</td>
                                <td colSpan={displayedClasses.length} className="p-3 bg-[#fffde7] rounded-xl text-center font-black text-[#f9a825] uppercase tracking-[1em] border border-[#fff9c4]">
                                  {period.startTime === '10:15' || period.startTime === '14:40' ? 'R E C R E I O' : 'I N T E R V A L O / A L M O Ç O'}
                                </td>
                              </tr>
                            );
                          }
                          return (
                            <tr key={period.id}>
                              <td className="p-4 bg-white rounded-xl font-black text-gray-600 text-center border border-gray-100 shadow-sm">
                                <div className="text-[14px] text-[#2e7d32]">{periodIdx + 1}º</div>
                                <div className="text-[9px] opacity-60 font-bold">{period.startTime}–{period.endTime}</div>
                              </td>
                              {displayedClasses.map(cls => {
                                const entry = schedule.find(s => s.classId === cls.id && s.periodId === period.id && s.dayOfWeek === currentDay);
                                return (
                                  <td key={cls.id} className="p-1 bg-gray-50/50 rounded-xl border border-gray-100/50 h-[70px]">
                                    <div className="flex flex-col gap-1 p-2 bg-white rounded-xl h-full justify-center shadow-sm">
                                      <span className="text-[10px] text-[#dc2626] font-black uppercase leading-tight">
                                        {entry ? teachers.find(t => t.id === entry.assignmentId.split('|')[0])?.name ?? '---' : ''}
                                      </span>
                                      {entry && <div className="h-px bg-[#f3f4f6] w-1/2 mx-auto" />}
                                      <span className="text-[10px] text-[#1b5e20] font-black uppercase">
                                        {entry ? subjects.find(s => s.id === entry.assignmentId.split('|')[1])?.name ?? '---' : ''}
                                      </span>
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </SortableContext>
                </div>
              )}

              <DragOverlay>
                {activeDrag && <DragPreview teacher={activeDrag.teacher} subject={activeDrag.subject} />}
              </DragOverlay>
            </DndContext>

            {!printMode && schedule.length > 0 && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl flex items-start gap-3 no-print">
                <div className="p-1 bg-blue-200 rounded-full text-blue-700 mt-0.5">
                  <GripVertical size={14} />
                </div>
                <p className="text-[10px] text-blue-800 font-bold leading-relaxed">
                  Arraste qualquer aula para outra célula para trocar de posição. A troca é bloqueada automaticamente se criar conflito de professor.
                  Para imprimir ou exportar PDF, clique em <strong>Modo Impressão</strong>.
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="bg-white py-4 text-center border-t border-gray-100 mt-auto no-print">
        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.2em]">
          Sistema de Gestão de Horários • <span className="text-[#2e7d32]">E.T.E. Achilino de Santis</span> • 2026
        </p>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #2e7d32; border-radius: 10px; }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          main { padding: 0 !important; }
          .shadow-2xl { box-shadow: none !important; }
        }
      ` }} />
    </div>
  );
}
