import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  setDoc,
  doc, 
  getDocs,
  updateDoc,
  serverTimestamp,
  orderBy,
  limit
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { 
  Users, 
  BarChart3, 
  Settings, 
  BookOpen, 
  MessageSquare, 
  Sparkles, 
  Mic, 
  ChevronRight, 
  ArrowLeft,
  Calendar,
  Layers,
  GraduationCap,
  Cloud,
  Lock,
  Plus,
  Video,
  ClipboardList,
  Edit3,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Globe,
  Loader2,
  X
} from 'lucide-react';

interface Lesson {
  id: string;
  title: string;
  language: string;
  level: string;
  assignedTo: string[];
}

interface Student {
  id: string;
  userId: string;
  name: string;
  progress: number;
  lastActive: string;
  weakTopics: string[];
}

export default function InstitutionPortal({ onExit }: { onExit: () => void }) {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'curriculum' | 'classroom' | 'feedback'>('dashboard');
  const [sessionCode, setSessionCode] = useState<string | null>(null);
  const [classroom, setClassroom] = useState<any>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [assignedLessons, setAssignedLessons] = useState<any[]>([]);
  const [showLessonBuilder, setShowLessonBuilder] = useState(false);
  const [showCreateClass, setShowCreateClass] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(false);

  // Check for existing classroom for this teacher on mount
  useEffect(() => {
    const fetchExistingClass = async () => {
      if (!auth.currentUser) return;
      setLoading(true);
      try {
        const q = query(
          collection(db, 'classrooms'), 
          where('teacherId', '==', auth.currentUser.uid),
          where('status', '==', 'active'),
          limit(1)
        );
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const data = snapshot.docs[0].data();
          setSessionCode(data.code);
        }
      } catch (err) {
        console.error("Error fetching existing class:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchExistingClass();
  }, []);

  // Listen to active classroom
  useEffect(() => {
    if (!sessionCode || !auth.currentUser) return;

    const q = query(
      collection(db, 'classrooms'), 
      where('code', '==', sessionCode), 
      where('teacherId', '==', auth.currentUser.uid),
      limit(1)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const classData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
        setClassroom(classData);

        // Listen to students in this classroom
        const studentsRef = collection(db, 'classrooms', snapshot.docs[0].id, 'students');
        const unsubStudents = onSnapshot(studentsRef, (studentSnapshot) => {
          let studentList = studentSnapshot.docs.map(d => ({
            id: d.id,
            ...d.data()
          })) as Student[];
          
          // Sort client-side by joinedAt desc
          studentList.sort((a, b) => {
            const dateA = a.joinedAt ? new Date(a.joinedAt).getTime() : 0;
            const dateB = b.joinedAt ? new Date(b.joinedAt).getTime() : 0;
            return dateB - dateA;
          });
          setStudents(studentList);
        });

        // Listen to assigned lessons
        const lessonsRef = collection(db, 'classrooms', snapshot.docs[0].id, 'lessons');
        const unsubLessons = onSnapshot(lessonsRef, (lessonSnapshot) => {
          const lessonList = lessonSnapshot.docs.map(d => ({
            id: d.id,
            ...d.data()
          }));
          
          // Sort client-side by assignedAt desc
          lessonList.sort((a: any, b: any) => {
            const dateA = a.assignedAt ? new Date(a.assignedAt).getTime() : 0;
            const dateB = b.assignedAt ? new Date(b.assignedAt).getTime() : 0;
            return dateB - dateA;
          });
          setAssignedLessons(lessonList);
        });

        return () => {
          unsubStudents();
          unsubLessons();
        };
      }
    });

    return () => unsubscribe();
  }, [sessionCode]);

  const handleCreateClass = async (language: string) => {
    setLoading(true);
    try {
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const newClass = {
        teacherId: auth.currentUser?.uid || 'guest',
        teacherName: auth.currentUser?.displayName || 'Profesor',
        language,
        code,
        status: 'active',
        createdAt: new Date().toISOString(),
        currentLessonId: null
      };

      await addDoc(collection(db, 'classrooms'), newClass);
      setSessionCode(code);
      setShowCreateClass(false);
      setActiveTab('dashboard');
    } catch (error) {
      console.error("Failed to create class:", error);
      alert("Hubo un error al crear el aula. Por favor reintenta.");
    } finally {
      setLoading(false);
    }
  };

  const handleAssignLesson = async (lesson: { title: string, level: string }) => {
    if (!classroom || !auth.currentUser) return;
    try {
      await addDoc(collection(db, 'classrooms', classroom.id, 'lessons'), {
        ...lesson,
        language: classroom.language,
        assignedAt: new Date().toISOString(),
        status: 'pending',
        teacherId: auth.currentUser.uid
      });
      alert('Lección asignada al aula.');
    } catch (error) {
      console.error(error);
    }
  };

  const handleEndSession = async () => {
    if (!classroom) return;
    if (!confirm('¿Estás seguro de que quieres finalizar la sesión actual? Los alumnos perderán la conexión.')) return;

    try {
      await updateDoc(doc(db, 'classrooms', classroom.id), {
        status: 'finished'
      });
      setSessionCode(null);
      setClassroom(null);
      setStudents([]);
      setAssignedLessons([]);
      setActiveTab('dashboard');
    } catch (error) {
      console.error("Failed to end session:", error);
    }
  };

  const generateCode = () => {
    setShowCreateClass(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
      {/* Header Interactivo */}
      <nav className="bg-slate-900 text-white px-8 py-6 flex items-center justify-between shadow-2xl">
        <div className="flex items-center gap-6">
          <button 
            onClick={onExit}
            className="p-2 hover:bg-white/10 rounded-xl transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <div className="flex items-center gap-3">
            <div className="bg-brand-primary p-2 rounded-xl">
              <GraduationCap size={28} />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight leading-none">Linguo for Institutions</h1>
              <p className="text-[10px] text-brand-primary font-bold uppercase tracking-widest mt-1">Portal Docente v2.0</p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {sessionCode && (
            <div className="hidden md:flex items-center gap-3 bg-brand-primary/20 px-4 py-2 rounded-full border border-brand-primary/30">
              <span className="text-[10px] font-black uppercase tracking-widest text-brand-primary">Código de Aula:</span>
              <span className="text-sm font-black font-mono text-white">{sessionCode}</span>
            </div>
          )}
          <div className="hidden md:flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full border border-white/10">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-widest text-slate-300">Aula en Vivo Activa</span>
          </div>
          <button 
            onClick={() => setShowCreateClass(true)}
            className="w-10 h-10 rounded-full bg-brand-primary text-white flex items-center justify-center font-black shadow-lg shadow-brand-primary/20 hover:scale-110 active:scale-95 transition-all"
            title="Crear Aula"
          >
            <Plus size={24} />
          </button>
        </div>
      </nav>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Sidebar */}
        <aside className="w-full md:w-64 bg-white border-r border-slate-200 p-6 flex flex-col gap-2">
          <SidebarItem 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')}
            icon={<BarChart3 size={20} />} 
            label="Analíticas" 
          />
          <SidebarItem 
            active={activeTab === 'curriculum'} 
            onClick={() => setActiveTab('curriculum')}
            icon={<Layers size={20} />} 
            label="Plan Escolar" 
          />
          <SidebarItem 
            active={activeTab === 'classroom'} 
            onClick={() => setActiveTab('classroom')}
            icon={<Users size={20} />} 
            label="Aula Interactiva" 
          />
          <SidebarItem 
            active={activeTab === 'feedback'} 
            onClick={() => setActiveTab('feedback')}
            icon={<MessageSquare size={20} />} 
            label="Feedback Docente" 
          />
          
          <div className="mt-auto pt-6 border-t border-slate-100 italic text-[10px] text-slate-400 leading-relaxed">
            "Alineado con el MCER (A1-C2) para asegurar estándares internacionales"
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 p-8 overflow-y-auto">
          {loading && !sessionCode && (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="animate-spin text-brand-primary" size={48} />
            </div>
          )}

          {!loading && !sessionCode && (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-2xl mx-auto space-y-8">
              <div className="w-24 h-24 bg-brand-primary/10 text-brand-primary rounded-[32px] flex items-center justify-center shadow-inner">
                <GraduationCap size={48} />
              </div>
              <div>
                <h2 className="text-4xl font-black font-serif text-slate-900">Bienvenido al Portal Institucional</h2>
                <p className="text-slate-500 mt-4 text-lg">No hay sesiones activas en este momento. Crea una nueva aula para empezar a enseñar en tiempo real.</p>
              </div>
              <button 
                onClick={() => setShowCreateClass(true)}
                className="px-10 py-5 bg-brand-primary text-white rounded-3xl font-black uppercase tracking-widest text-sm shadow-2xl shadow-brand-primary/30 hover:scale-105 active:scale-95 transition-all flex items-center gap-3"
              >
                <Plus size={24} /> Crear Mi Primera Clase
              </button>
            </div>
          )}

          {sessionCode && activeTab === 'dashboard' && (
            <DashboardView 
              onSelectStudent={setSelectedStudent} 
              students={students}
              classroom={classroom}
              assignedLessons={assignedLessons}
              onEndSession={handleEndSession}
            />
          )}
          {sessionCode && activeTab === 'curriculum' && (
            <CurriculumView 
              onOpenBuilder={() => setShowLessonBuilder(true)} 
              onAssign={handleAssignLesson}
            />
          )}
          {sessionCode && activeTab === 'classroom' && <ClassroomView sessionCode={sessionCode} onGenerateCode={generateCode} students={students} />}
          {sessionCode && activeTab === 'feedback' && <FeedbackView />}
        </main>
      </div>

      {/* Modals */}
      {showLessonBuilder && (
        <LessonBuilderModal onClose={() => setShowLessonBuilder(false)} />
      )}

      {showCreateClass && (
        <CreateClassModal onClose={() => setShowCreateClass(false)} onCreate={handleCreateClass} />
      )}

      {selectedStudent && (
        <StudentDetailModal 
          student={selectedStudent} 
          onClose={() => setSelectedStudent(null)} 
        />
      )}


      {/* Footer / Trust badges */}
      <footer className="bg-white border-t border-slate-200 px-8 py-3 flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
        <div className="flex gap-6">
          <div className="flex items-center gap-2"><Lock size={12} /> Datos Seguros (GDPR)</div>
          <div className="flex items-center gap-2"><Cloud size={12} /> Sincronizado con Canvas/Classroom</div>
        </div>
        <div>Propuesta Linguo Educación 2026</div>
      </footer>
    </div>
  );
}

function SidebarItem({ icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200 font-bold ${active ? 'bg-brand-primary text-white shadow-lg shadow-brand-primary/20' : 'text-slate-500 hover:bg-slate-100'}`}
    >
      {icon}
      <span className="text-sm">{label}</span>
    </button>
  );
}

function DashboardView({ onSelectStudent, students, classroom, assignedLessons, onEndSession }: { onSelectStudent: (s: Student) => void, students: Student[], classroom: any, assignedLessons: any[], onEndSession: () => void }) {
  return (
    <div className="space-y-8 max-w-5xl">
      <div className="flex justify-between items-end">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="px-3 py-1 bg-green-500 text-white text-[10px] font-black uppercase tracking-widest rounded-full animate-pulse">En Vivo</span>
            <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Código: {classroom?.code}</span>
          </div>
          <h2 className="text-3xl font-black font-serif text-slate-900">Dashboard del Instructor</h2>
          <p className="text-slate-500">{classroom ? `Aula Activa: ${classroom.language}` : 'No hay aula activa'}</p>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={onEndSession}
            className="flex items-center gap-2 px-6 py-3 bg-red-50 text-red-600 border border-red-100 rounded-2xl font-bold hover:bg-red-100 transition-colors"
          >
             <X size={18} />
             <span>Finalizar Sesión</span>
          </button>
          <div className="flex items-center gap-2 px-6 py-3 bg-white rounded-2xl border border-slate-200">
             <Users size={18} className="text-brand-primary" />
             <span className="font-bold">{students.length} Alumnos</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'Participación', value: students.length > 0 ? 'Media' : '---', trend: 'N/A', icon: <Calendar size={16} /> },
          { label: 'Tasa de Aciertos', value: '---', trend: 'N/A', icon: <CheckCircle2 size={16} /> },
          { label: 'Lecciones Asignadas', value: assignedLessons.length.toString(), trend: 'N/A', icon: <Layers size={16} /> },
          { label: 'En Riesgo', value: '0', trend: 'N/A', icon: <AlertCircle size={16} />, color: 'text-slate-300' },
        ].map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-2 text-slate-400">
               {stat.icon}
               <span className="text-[10px] font-black uppercase tracking-widest">{stat.label}</span>
            </div>
            <div className={`text-2xl font-black ${stat.color || 'text-slate-900'}`}>{stat.value}</div>
            <div className={`text-[10px] font-bold mt-1 text-slate-400`}>
              {stat.trend} esta semana
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-[32px] overflow-hidden border border-slate-200 shadow-sm min-h-[300px]">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
               <h3 className="font-black text-xs uppercase tracking-widest text-slate-500">Lista Detallada de Seguimiento</h3>
            </div>
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200 font-black text-[10px] text-slate-400 uppercase tracking-widest">
                <tr>
                  <th className="px-6 py-4">Estudiante</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Dominio</th>
                  <th className="px-6 py-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-bold">
                {students.map(student => (
                  <tr key={student.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-5 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center font-black">
                        {student.name.charAt(0)}
                      </div>
                      <div>
                        <div className="text-sm">{student.name}</div>
                        <div className="text-[10px] font-medium text-slate-400">Último Reto: Hace poco</div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <span className="px-3 py-1 rounded-full text-[9px] uppercase tracking-widest bg-green-100 text-green-600">
                        Activo
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs">{student.progress || 0}%</span>
                        <div className="flex-1 w-12 h-1 bg-slate-100 rounded-full">
                           <div className="h-full bg-brand-primary rounded-full" style={{ width: `${student.progress || 0}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <button 
                        onClick={() => onSelectStudent(student)}
                        className="p-2 text-brand-primary hover:bg-brand-primary/10 rounded-xl transition-all font-black text-[10px] uppercase tracking-widest"
                      >
                        Analizar
                      </button>
                    </td>
                  </tr>
                ))}
                {students.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400 font-medium italic">
                      No hay estudiantes conectados aún. Comparte el código de sesión para comenzar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-[32px] p-8 border border-slate-200">
             <div className="flex items-center gap-2 mb-6">
                <ClipboardList className="text-brand-primary" size={20} />
                <h4 className="font-black text-sm uppercase tracking-widest">Lecciones Asignadas</h4>
             </div>
             <div className="space-y-4">
                {assignedLessons.map((lesson, i) => (
                  <div key={i} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="font-bold text-sm text-slate-800">{lesson.title}</div>
                    <div className="flex justify-between mt-2">
                       <span className="text-[10px] text-slate-400">Nivel: {lesson.level}</span>
                       <span className="text-[10px] text-brand-primary font-black uppercase">{lesson.status}</span>
                    </div>
                  </div>
                ))}
                {assignedLessons.length === 0 && (
                  <div className="text-center py-8 text-slate-300 text-xs italic">
                    Ninguna lección asignada aún.
                  </div>
                )}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CurriculumView({ onOpenBuilder, onAssign }: { onOpenBuilder: () => void, onAssign: (l: any) => void }) {
  const DEFAULT_CURRICULUM = [
    { id: 'c1', title: 'Presente Simple y Rutinas', level: 'A1' },
    { id: 'c2', title: 'Pasado y Narrativa', level: 'A2' },
    { id: 'c3', title: 'Condicionales y Deseos', level: 'B2' },
  ];

  return (
    <div className="max-w-5xl space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-black font-serif text-slate-900">Gestión de Contenidos</h2>
          <p className="text-slate-500">Diseña lecciones personalizadas o usa el currículo estándar.</p>
        </div>
        <button 
          onClick={onOpenBuilder}
          className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest flex items-center gap-3 shadow-xl shadow-slate-900/10 hover:scale-105 active:scale-95 transition-all"
        >
          <Edit3 size={20} /> Crear Lección Custom
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {DEFAULT_CURRICULUM.map(lesson => (
          <div key={lesson.id} className="bg-white rounded-[32px] p-6 border border-slate-200 shadow-sm group hover:border-brand-primary transition-all">
            <h3 className="text-xl font-black font-serif text-slate-900 mb-2 truncate">{lesson.title}</h3>
            <div className="flex items-center gap-2 text-slate-400 text-xs mb-6">
               <Layers size={14} /> <span>Nivel: {lesson.level}</span>
            </div>
            <div className="pt-4 border-t border-slate-50 flex justify-end items-center">
               <button 
                onClick={() => onAssign(lesson)}
                className="text-[10px] font-black text-brand-primary uppercase hover:underline"
               >
                 Asignar al Aula
               </button>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white rounded-[40px] p-10 border border-slate-200 shadow-xl shadow-slate-200/50">
          <h3 className="text-xl font-black font-serif mb-6 flex items-center gap-3">
             <Layers className="text-brand-primary" /> Módulos Activos
          </h3>
          <div className="space-y-2">
            {[
              { name: 'Fundamentos del Idioma', active: true, desc: 'Gramática básica y saludos' },
              { name: 'Mundo Profesional', active: true, desc: 'Entrevistas y correos' },
              { name: 'Contexto Cultural', active: false, desc: 'Historia y tradiciones' },
              { name: 'Viajes y Supervivencia', active: true, desc: 'Aeropuertos y hoteles' },
            ].map((module, i) => (
              <div key={i} className={`p-5 rounded-3xl border-2 transition-all flex items-center justify-between ${module.active ? 'bg-brand-primary/5 border-brand-primary/20' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                <div>
                  <div className="font-bold text-slate-900">{module.name}</div>
                  <div className="text-[10px] text-slate-500 font-medium">{module.desc}</div>
                </div>
                <button className={`w-12 h-6 rounded-full relative transition-colors ${module.active ? 'bg-brand-primary' : 'bg-slate-300'}`}>
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${module.active ? 'right-1' : 'left-1'}`} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-900 rounded-[40px] p-10 border border-white/10 shadow-2xl text-white">
          <h3 className="text-xl font-black font-serif mb-4 flex items-center gap-3">
             <Cloud className="text-brand-secondary" /> Carga de Materiales
          </h3>
          <div className="aspect-video border-2 border-dashed border-white/20 rounded-[32px] flex flex-col items-center justify-center text-center p-8 hover:border-brand-secondary transition-colors cursor-pointer group">
            <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
               <ArrowLeft className="rotate-90 text-brand-secondary" />
            </div>
            <div className="font-bold mb-1">Subir PDF o Imágenes</div>
            <p className="text-xs text-white/40">Nuestra AI generará lecciones personalizadas basadas en tu material.</p>
          </div>
          <div className="mt-8 flex items-center gap-4 bg-white/5 p-4 rounded-2xl text-xs font-bold font-mono">
            <Settings size={16} /> 
            <span>MCER AI-Aligment Engine v4.0</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ClassroomView({ sessionCode, onGenerateCode, students }: { sessionCode: string | null, onGenerateCode: () => void, students: Student[] }) {
  const [sessionType, setSessionType] = useState<'tutoring' | 'group'>('group');

  return (
    <div className="max-w-5xl space-y-8">
      <div className="flex justify-between items-center bg-slate-900 rounded-[40px] p-10 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-brand-primary/20 to-transparent pointer-events-none" />
        <div className="relative">
          <div className="text-[10px] font-black text-brand-secondary uppercase tracking-[0.3em] mb-2">Modo en Vivo</div>
          <h2 className="text-4xl font-black font-serif mb-4">
            {sessionType === 'tutoring' ? 'Tutoría 1:1' : 'Aula Interactiva'}
          </h2>
          <div className="flex items-center gap-6">
            {!sessionCode ? (
              <div className="flex gap-2">
                <button 
                  onClick={() => { setSessionType('group'); onGenerateCode(); }}
                  className="flex items-center gap-2 bg-brand-primary px-6 py-3 rounded-2xl font-black text-sm uppercase tracking-widest hover:scale-105 transition-all shadow-xl shadow-brand-primary/20"
                >
                  <Users size={18} /> Iniciar Clase Grupal
                </button>
                <button 
                  onClick={() => { setSessionType('tutoring'); onGenerateCode(); }}
                  className="flex items-center gap-2 bg-brand-secondary px-6 py-3 rounded-2xl font-black text-sm uppercase tracking-widest hover:scale-105 transition-all shadow-xl shadow-brand-secondary/20"
                >
                  <Video size={18} /> Tutoría 1:1
                </button>
              </div>
            ) : (
              <div className="bg-white/10 px-6 py-3 rounded-2xl border border-white/20 flex flex-col">
                <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Código de Sesión</span>
                <span className="text-xl font-black font-mono text-brand-secondary">{sessionCode}</span>
              </div>
            )}
            <div className="flex items-center gap-6">
              <div className="flex -space-x-3">
                {students.slice(0, 5).map(s => (
                  <div key={s.id} className="w-10 h-10 rounded-full bg-brand-primary border-2 border-slate-900 flex items-center justify-center font-bold text-xs uppercase">{s.name.charAt(0)}</div>
                ))}
                {students.length > 5 && (
                  <div className="w-10 h-10 rounded-full bg-slate-700 border-2 border-slate-900 flex items-center justify-center font-bold text-xs">+{students.length - 5}</div>
                )}
              </div>
              <span className="text-sm font-bold text-slate-400">
                {students.length > 0 ? `${students.length} Estudiantes` : 'En espera...'}
              </span>
            </div>
          </div>
        </div>
        <div className="relative flex flex-col gap-4">
           <button className="px-8 py-4 bg-brand-secondary text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-brand-secondary/20 hover:scale-105 transition-all">Compartir Pantalla</button>
           <button className="px-8 py-4 bg-white/10 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-white/20 transition-all border border-white/10 text-center">Grabación Off</button>
        </div>
      </div>


      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 bg-white rounded-3xl p-6 border border-slate-200">
           <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Ranking en Vivo</h4>
           <div className="space-y-4">
             {students.slice(0, 3).map((s, i) => (
                <div key={i} className="flex items-center justify-between font-bold">
                  <div className="flex items-center gap-3">
                    <span className={`text-sm ${i === 0 ? 'text-amber-400' : 'text-slate-300'}`}>#{i + 1}</span>
                    <span className="text-sm text-slate-700">{s.name}</span>
                  </div>
                  <span className="text-brand-primary">{(s.progress || 0) * 13} XP</span>
                </div>
             ))}
             {students.length === 0 && (
                <div className="text-center py-4 text-xs text-slate-300 italic">Sin actividad</div>
             )}
           </div>
        </div>

        <div className="md:col-span-2 bg-brand-primary/5 rounded-3xl p-8 border-2 border-brand-primary/10 relative">
          <Sparkles className="text-brand-primary/40 absolute top-6 right-6" />
          <h4 className="text-xl font-black font-serif text-slate-900 mb-2">Actividad Recomendada</h4>
          <p className="text-slate-600 mb-8 max-w-lg">Inicia un reto de traducción basado en las dificultades actuales del grupo (Preposiciones).</p>
          <div className="grid grid-cols-2 gap-4">
            <button className="bg-white p-6 rounded-3xl border-2 border-brand-primary/20 hover:border-brand-primary transition-all text-left group">
              <div className="text-[10px] font-black text-brand-primary uppercase mb-2">Individual</div>
              <div className="font-bold text-slate-800 group-hover:text-brand-primary">Duelo de Flashcards</div>
            </button>
            <button className="bg-white p-6 rounded-3xl border-2 border-brand-primary/20 hover:border-brand-primary transition-all text-left group">
              <div className="text-[10px] font-black text-brand-primary uppercase mb-2">Equipos</div>
              <div className="font-bold text-slate-800 group-hover:text-brand-primary">Carrera de Traducción</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeedbackView() {
  const [activeVoice, setActiveVoice] = useState(false);

  return (
    <div className="max-w-5xl space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-black font-serif text-slate-900">Feedback y Correcciones</h2>
          <p className="text-slate-500">Revisa los audios y textos enviados por tus estudiantes para dar una guía humana.</p>
        </div>
        <div className="flex gap-2">
          <div className="bg-brand-primary text-white px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest flex items-center gap-2">
            <MessageSquare size={14} /> 12 Pendientes
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {[
          { student: 'Ana Garcia', type: 'Audio', content: '"Gestern bin ich zum Park gegangen"', comment: 'La pronunciación de Gestern fue excelente.' },
          { student: 'Luis Miller', type: 'Texto', content: 'In der Bäckerei... (Ejercicio Completo)', comment: 'Necesita corrección en el orden de los verbos.' },
        ].map((item, i) => (
          <div key={i} className="bg-white hover:bg-slate-50 transition-all rounded-[32px] p-8 border border-slate-200 shadow-sm flex flex-col md:flex-row gap-8 items-center cursor-pointer group">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <div className="text-xs font-black text-brand-primary uppercase tracking-widest">{item.student}</div>
                <div className={`px-2 py-1 rounded text-[8px] font-black uppercase tracking-widest ${item.type === 'Audio' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                  {item.type}
                </div>
              </div>
              <div className="text-lg font-bold text-slate-600 mb-2">{item.content}</div>
              {item.comment && <div className="text-xs text-slate-400 italic">Previa AI: {item.comment}</div>}
            </div>
            
            <div className="flex gap-3">
               <button 
                onClick={() => setActiveVoice(!activeVoice)}
                className={`p-4 rounded-2xl flex items-center gap-2 font-black text-[10px] uppercase tracking-widest transition-all ${activeVoice ? 'bg-red-500 text-white shadow-xl shadow-red-500/20' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
               >
                 <Mic size={18} /> {activeVoice ? 'Grabando Nota...' : 'Responder con Voz'}
               </button>
               <button className="p-4 bg-slate-900 text-white hover:bg-black rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all">Enviar Corrección</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CreateClassModal({ onClose, onCreate }: { onClose: () => void, onCreate: (lang: string) => void }) {
  const [lang, setLang] = useState('Inglés');
  
  return (
    <div className="fixed inset-0 z-[700] bg-slate-900/80 backdrop-blur-xl flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white w-full max-w-lg rounded-[40px] p-10 shadow-2xl relative overflow-hidden text-slate-900"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-brand-primary/5 rounded-full blur-3xl -mr-16 -mt-16" />
        
        <div className="text-center space-y-8">
          <div className="w-20 h-20 bg-brand-primary/10 text-brand-primary rounded-3xl flex items-center justify-center mx-auto shadow-inner">
            <GraduationCap size={40} />
          </div>
          
          <div>
            <h3 className="text-3xl font-black font-serif">Nueva Aula en Vivo</h3>
            <p className="text-slate-500 font-medium mt-2">Configura la sesión para tus estudiantes.</p>
          </div>

          <div className="space-y-4 text-left">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-2">Idioma de la Clase</label>
              <div className="grid grid-cols-2 gap-3">
                {['Inglés', 'Español', 'Alemán', 'Francés'].map(l => (
                  <button 
                    key={l}
                    onClick={() => setLang(l)}
                    className={`p-4 rounded-2xl border-2 font-black transition-all ${lang === l ? 'border-brand-primary bg-brand-primary/5 text-brand-primary' : 'border-slate-100 text-slate-400 hover:border-slate-200'}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <button 
              onClick={onClose}
              className="flex-1 py-5 bg-slate-100 text-slate-500 rounded-3xl font-black uppercase tracking-widest text-xs"
            >
              Cerrar
            </button>
            <button 
              onClick={() => onCreate(lang)}
              className="flex-[2] py-5 bg-brand-primary text-white rounded-3xl font-black uppercase tracking-widest text-xs shadow-xl shadow-brand-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
            >
              Crear y Generar Código
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function LessonBuilderModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[600] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white w-full max-w-2xl rounded-[40px] p-10 shadow-2xl relative overflow-hidden text-slate-900"
      >
        <div className="flex justify-between items-center mb-8">
           <div className="flex items-center gap-3">
             <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center">
               <Edit3 size={24} />
             </div>
             <div>
               <h3 className="text-2xl font-black font-serif">Creador de Lecciones</h3>
               <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Contenido Personalizado Institutions</p>
             </div>
           </div>
           <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><Trash2 size={24} className="text-slate-400" /></button>
        </div>

        <div className="space-y-6">
           <div className="grid grid-cols-2 gap-4 text-slate-900">
             <div className="space-y-2">
               <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Título de la Lección</label>
               <input type="text" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold" placeholder="Ej: Futuro Próximo" />
             </div>
             <div className="space-y-2">
               <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Idioma / Disciplina</label>
               <select className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold">
                  <option>Español</option>
                  <option>Inglés</option>
                  <option>Alemán</option>
               </select>
             </div>
           </div>

           <div className="space-y-2">
             <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Explicación para el Estudiante</label>
             <textarea className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-6 font-medium min-h-[120px]" placeholder="Escribe aquí el concepto clave que quieres enseñar..." />
           </div>

           <div className="p-6 border-2 border-dashed border-slate-100 rounded-3xl text-center">
              <Plus className="mx-auto text-slate-300 mb-2" size={32} />
              <p className="text-sm font-bold text-slate-400">Agregar Ejercicio Interactivo (Quiz, SRS, Audio)</p>
           </div>
        </div>

        <div className="mt-10 flex gap-4">
          <button onClick={onClose} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase tracking-widest text-xs">Descartar</button>
          <button onClick={onClose} className="flex-[2] py-4 bg-brand-primary text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-brand-primary/20">Publicar al Aula</button>
        </div>
      </motion.div>
    </div>
  );
}

function StudentDetailModal({ student, onClose }: { student: Student, onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[600] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-full max-w-3xl rounded-[40px] p-10 shadow-2xl relative overflow-hidden text-slate-900"
      >
        <div className="flex justify-between items-start mb-8">
           <div className="flex items-center gap-6">
             <div className="w-20 h-20 bg-brand-primary text-white rounded-[32px] flex items-center justify-center text-3xl font-black shadow-xl shadow-brand-primary/20">
               {student.name.charAt(0)}
             </div>
             <div>
               <h3 className="text-3xl font-black font-serif text-slate-900">{student.name}</h3>
               <div className="flex items-center gap-2 mt-1">
                 <div className="w-2 h-2 bg-green-500 rounded-full" />
                 <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nivel Avanzado (C1)</span>
               </div>
             </div>
           </div>
           <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><ArrowLeft className="text-slate-400" size={24} /></button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
           <div className="space-y-6">
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                 <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Temas que le cuestan</h4>
                 <div className="flex flex-wrap gap-2">
                    {student.weakTopics.map((topic, i) => (
                      <span key={i} className="px-3 py-1 bg-red-100 text-red-600 text-[10px] font-black uppercase tracking-widest rounded-full">{topic}</span>
                    ))}
                 </div>
              </div>
              <div className="bg-brand-primary/5 p-6 rounded-3xl border border-brand-primary/10">
                 <h4 className="text-[10px] font-black uppercase tracking-widest text-brand-primary mb-4">Próxima meta recomendada</h4>
                 <p className="text-sm font-bold text-slate-700 leading-relaxed italic">"Enfocarse en preposiciones de lugar antes del examen del viernes."</p>
              </div>
           </div>

           <div className="bg-white border border-slate-200 rounded-3xl p-6">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6">Actividad - Últimos 7 días</h4>
              <div className="h-32 flex items-end justify-between gap-2">
                 {[45, 80, 55, 90, 70, 40, 85].map((h, i) => (
                   <div key={i} className="flex-1 bg-brand-primary/20 rounded-t-lg relative group">
                      <div className="absolute bottom-0 w-full bg-brand-primary rounded-t-lg transition-all group-hover:bg-brand-secondary" style={{ height: `${h}%` }} />
                   </div>
                 ))}
              </div>
              <div className="flex justify-between mt-2 text-[8px] font-black text-slate-300 uppercase tracking-widest">
                 <span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span><span>D</span>
              </div>
           </div>
        </div>

        <div className="flex gap-4 pt-6 border-t border-slate-100">
           <button className="flex-1 py-4 bg-brand-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2">
             <Edit3 size={16} /> Asignar Lección
           </button>
           <button className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2">
             <MessageSquare size={16} /> Mensaje Directo
           </button>
        </div>
      </motion.div>
    </div>
  );
}
