/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Languages, 
  Search, 
  BookOpen, 
  Heart,
  Layers,
  Users,
  GraduationCap,
  MessageSquare, 
  Trophy, 
  ChevronRight, 
  ArrowLeft,
  Sparkles,
  Volume2,
  RefreshCw,
  Send,
  Loader2,
  Mic,
  MicOff,
  CheckCircle2,
  Star,
  Zap,
  Headphones,
  Ear,
  MessageCircle,
  Settings,
  X
} from 'lucide-react';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  setDoc, 
  doc, 
  updateDoc, 
  serverTimestamp,
  onSnapshot,
  limit
} from 'firebase/firestore';
import { db, auth } from './lib/firebase';
import { Language, LessonContent, ChatMessage, UserProgress, SRSItem, OperationType } from './types';
import { POPULAR_LANGUAGES, CATEGORIES, TUTOR_SCENARIOS, TUTOR_PERSONAS, INITIAL_QUESTS, INITIAL_ACHIEVEMENTS } from './constants';
import { 
  generateLesson, 
  generateTutorResponse, 
  generateVisualForWord, 
  findLanguageBySearch,
  analyzeConversationAndFeedback,
  generateAudio,
  generateStory
} from './services/geminiService';
import { StoryContent } from './types';
import LivePractice from './components/LivePractice';
import Flashcards from './components/Flashcards';
import InstitutionPortal from './components/InstitutionPortal';

const speak = (text: string, langCode: string) => {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = langCode;
  window.speechSynthesis.speak(utterance);
};

type Screen = 'landing' | 'lesson' | 'tutor' | 'complete' | 'review' | 'conversation_practice' | 'story' | 'live_practice' | 'institution';

function ReviewRenderer({ items, onFinish, onUpdateSRS }: { items: SRSItem[], onFinish: () => void, onUpdateSRS: (word: string, translation: string, lang: string, quality: number) => void }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showTranslation, setShowTranslation] = useState(false);
  
  const currentItem = items[currentIndex];

  const handleRate = (quality: number) => {
    onUpdateSRS(currentItem.word, currentItem.translation, currentItem.languageCode, quality);
    if (currentIndex < items.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setShowTranslation(false);
    } else {
      onFinish();
    }
  };

  if (!currentItem) return null;

  return (
    <div className="space-y-8 text-center animate-in fade-in zoom-in-95 duration-300">
      <div className="space-y-2">
        <div className="text-[10px] font-black text-brand-primary uppercase tracking-[0.2em]">Revisando {currentIndex + 1} de {items.length}</div>
        <h3 className="text-5xl font-black font-serif text-charcoal">{currentItem.word}</h3>
      </div>

      <div className="min-h-[100px] flex items-center justify-center">
        {showTranslation ? (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="text-3xl font-bold text-brand-secondary">{currentItem.translation}</div>
            <button 
              onClick={() => speak(currentItem.word, currentItem.languageCode)}
              className="p-3 bg-brand-primary/10 text-brand-primary rounded-full hover:bg-brand-primary/20 transition-all"
            >
              <Volume2 size={24} />
            </button>
          </motion.div>
        ) : (
          <button 
            onClick={() => setShowTranslation(true)}
            className="px-8 py-4 bg-brand-accent text-brand-primary font-bold rounded-2xl hover:bg-brand-primary/10 transition-all border border-brand-primary/10"
          >
            Mostrar traducción
          </button>
        )}
      </div>

      {showTranslation && (
        <div className="space-y-6 pt-10 border-t border-black/5">
          <div className="text-xs font-bold text-slate-text uppercase tracking-widest">¿Qué tan bien lo recordaste?</div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[1, 2, 3, 4, 5].map(q => (
              <button
                key={q}
                onClick={() => handleRate(q)}
                className="py-4 rounded-xl border-2 border-black/5 hover:border-brand-primary hover:bg-brand-primary/5 transition-all font-bold text-charcoal flex flex-col items-center gap-1"
              >
                <span className="text-lg">{q}</span>
                <span className="text-[10px] uppercase tracking-tighter text-slate-text">
                  {q === 1 ? 'Nada' : q === 5 ? 'Perfeto' : ''}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ExerciseRenderer({ exercise, selectedLanguage, onCorrect, onIncorrect }: { exercise: any, selectedLanguage: any, onCorrect: () => void, onIncorrect: () => void }) {
  const [answered, setAnswered] = useState<string | null>(null);
  const [fillValue, setFillValue] = useState('');
  const [matchingPairs, setMatchingPairs] = useState<any[]>([]);
  const [matchedIds, setMatchedIds] = useState<string[]>([]);
  const [selectedPair, setSelectedPair] = useState<any | null>(null);
  const [pronunciationScore, setPronunciationScore] = useState<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);

  const calculateAccuracy = (original: string, recognized: string) => {
    const s1 = original.toLowerCase().trim();
    const s2 = recognized.toLowerCase().trim();
    if (s1 === s2) return 100;
    const words1 = s1.split(/\s+/);
    const words2 = s2.split(/\s+/);
    const matches = words1.filter(w => words2.includes(w)).length;
    return Math.round((matches / words1.length) * 100);
  };

  const startSpeechRecognition = (onResult: (text: string) => void) => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = selectedLanguage.code;
    recognition.onstart = () => setIsRecording(true);
    recognition.onend = () => setIsRecording(false);
    recognition.onresult = (event: any) => onResult(event.results[0][0].transcript);
    recognition.start();
  };

  useEffect(() => {
    if (exercise.type === 'matching' && exercise.pairs) {
      const allItems = [
        ...exercise.pairs.map((p: any) => ({ ...p, side: 'key', id: `k_${p.key}` })),
        ...exercise.pairs.map((p: any) => ({ ...p, side: 'value', id: `v_${p.value}` }))
      ].sort(() => Math.random() - 0.5);
      setMatchingPairs(allItems);
    }
  }, [exercise]);

  const handleMatch = (item: any) => {
    if (matchedIds.includes(item.id)) return;
    if (!selectedPair) {
      setSelectedPair(item);
    } else {
      if (selectedPair.side !== item.side && (
        (selectedPair.side === 'key' && selectedPair.value === item.value) ||
        (selectedPair.side === 'value' && selectedPair.key === item.key)
      )) {
        setMatchedIds(prev => [...prev, selectedPair.id, item.id]);
        if (matchedIds.length + 2 === matchingPairs.length) {
          onCorrect();
        }
      }
      setSelectedPair(null);
    }
  };

  if (exercise.type === 'multiple_choice') {
    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
        <h3 className="text-2xl font-black font-serif text-charcoal text-center">{exercise.question}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {exercise.options?.map((opt: string, i: number) => (
            <button
              key={i}
              onClick={() => {
                if (answered) return;
                setAnswered(opt);
                if (opt === exercise.correctAnswer) {
                  onCorrect();
                } else {
                  onIncorrect();
                }
              }}
              className={`p-6 rounded-3xl border-2 transition-all font-bold text-left ${
                answered === opt
                  ? opt === exercise.correctAnswer
                    ? 'bg-brand-primary/10 border-brand-primary text-brand-primary'
                    : 'bg-red-50 border-red-200 text-red-500'
                  : 'bg-cream border-black/5 hover:border-brand-primary'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (exercise.type === 'fill_in_blank') {
    return (
      <div className="space-y-8 text-center animate-in fade-in slide-in-from-bottom-4">
        <h3 className="text-2xl font-black font-serif text-charcoal">{exercise.question}</h3>
        <input 
          type="text"
          value={fillValue}
          onChange={(e) => {
            setFillValue(e.target.value);
            if (e.target.value.toLowerCase().trim() === exercise.correctAnswer.toLowerCase().trim()) {
              onCorrect();
            }
          }}
          className="w-full max-w-md mx-auto bg-brand-accent/50 border-2 border-brand-primary/20 rounded-2xl py-4 px-6 text-xl font-bold text-center focus:ring-4 ring-brand-primary/10 transition-all outline-none"
          placeholder="Escribe la respuesta..."
        />
      </div>
    );
  }

  if (exercise.type === 'matching') {
    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
        <h3 className="text-2xl font-black font-serif text-charcoal text-center">Empareja los conceptos</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {matchingPairs.map((item, i) => (
            <button
              key={i}
              onClick={() => handleMatch(item)}
              className={`p-6 rounded-[24px] border-2 transition-all font-bold text-center h-24 flex items-center justify-center ${
                matchedIds.includes(item.id)
                  ? 'bg-brand-primary/10 border-brand-primary text-brand-primary opacity-50'
                  : selectedPair?.id === item.id
                    ? 'bg-brand-secondary/10 border-brand-secondary text-brand-secondary'
                    : 'bg-cream border-black/5 hover:border-brand-primary'
              }`}
            >
              {item.side === 'key' ? item.key : item.value}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (exercise.type === 'pronunciation') {
    return (
      <div className="space-y-8 text-center animate-in fade-in slide-in-from-bottom-4">
        <h3 className="text-2xl font-black font-serif text-charcoal">{exercise.question}</h3>
        <div className="flex flex-col items-center gap-6">
          <div className="text-sm font-bold text-slate-text uppercase tracking-widest">Escucha y repite:</div>
          <div className="text-4xl font-black text-brand-primary italic">"{exercise.correctAnswer}"</div>
          <button 
            onClick={() => {
              speak(exercise.correctAnswer, selectedLanguage.code);
            }}
            className="p-3 bg-brand-primary/10 text-brand-primary rounded-xl hover:bg-brand-primary/20 transition-all flex items-center gap-2"
          >
            <Volume2 size={20} /> Oír de nuevo
          </button>
          <button 
            onClick={() => {
              startSpeechRecognition((text) => {
                const score = calculateAccuracy(exercise.correctAnswer, text);
                setPronunciationScore(score);
                if (score >= 80) {
                  onCorrect();
                } else {
                  onIncorrect();
                }
              });
            }}
            className={`w-24 h-24 rounded-full flex items-center justify-center transition-all ${
              isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-brand-primary text-white shadow-xl shadow-brand-primary/30 hover:scale-105'
            }`}
          >
            {isRecording ? <MicOff size={32} /> : <Mic size={32} />}
          </button>
          {pronunciationScore !== null && (
            <div className={`text-xl font-bold ${pronunciationScore >= 80 ? 'text-brand-primary' : 'text-red-500'}`}>
              Puntuación: {pronunciationScore}%
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('landing');
  const [selectedLanguage, setSelectedLanguage] = useState<Language | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>(CATEGORIES[0]);
  const [lesson, setLesson] = useState<LessonContent | null>(null);
  const [currentExerciseIdx, setCurrentExerciseIdx] = useState(0);
  const [lessonImage, setLessonImage] = useState<string | null>('');
  const [loading, setLoading] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [conversationAnalysis, setConversationAnalysis] = useState<{feedback: string, suggestions: string[]} | null>(null);
  const [userMsg, setUserMsg] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState(TUTOR_SCENARIOS[0]);
  const [selectedPersona, setSelectedPersona] = useState('regular');
  const [story, setStory] = useState<StoryContent | null>(null);
  const [storyImage, setStoryImage] = useState<string | null>(null);
  const [showStoryQuiz, setShowStoryQuiz] = useState(false);
  const [currentStoryQuestionIdx, setCurrentStoryQuestionIdx] = useState(0);
  const [storyQuizAnswered, setStoryQuizAnswered] = useState<string | null>(null);

  const [progress, setProgress] = useState<UserProgress>(() => {
    const saved = localStorage.getItem('linguo_progress');
    const defaults: UserProgress = {
      points: 0,
      level: 1,
      displayName: 'Aprendiz',
      avatarSeed: 'learner-' + Math.random(),
      slogan: '¡Aprendiendo idiomas!',
      completedLessons: [],
      completedTopics: [],
      streak: 0,
      lastLogin: new Date().toISOString(),
      quests: INITIAL_QUESTS,
      achievements: INITIAL_ACHIEVEMENTS,
      srsData: [],
    };

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...defaults,
          ...parsed,
          completedLessons: parsed.completedLessons || [],
          srsData: parsed.srsData || [],
          quests: parsed.quests || INITIAL_QUESTS,
          achievements: parsed.achievements || INITIAL_ACHIEVEMENTS
        };
      } catch (e) {
        console.error("Error parsing progress", e);
      }
    }
    return defaults;
  });

  const [leaderboard, setLeaderboard] = useState(() => {
    const names = ["Elena_92", "MarcoPoly", "LiaLearning", "Santi_ES", "Nina_Vibe", "Klaus_DE", "Yuki_JP", "Chloe_FR", "Alex_Study", "Luka_Br"];
    return names
      .map(name => ({
        name,
        points: Math.floor(Math.random() * 2000) + 500,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`
      }))
      .sort((a, b) => b.points - a.points);
  });

  useEffect(() => {
    localStorage.setItem('linguo_progress', JSON.stringify(progress));
  }, [progress]);

  const updateSRS = (word: string, translation: string, langCode: string, quality: number) => {
    // Quality 0-5
    setProgress(prev => {
      const existingIdx = prev.srsData.findIndex(item => item.word === word);
      let item: SRSItem;

      if (existingIdx >= 0) {
        item = { ...prev.srsData[existingIdx] };
      } else {
        item = {
          word,
          translation,
          languageCode: langCode,
          difficulty: 0.3,
          interval: 0,
          easinessFactor: 2.5,
          nextReview: new Date().toISOString(),
          repetitionCount: 0
        };
      }

      // SM-2 Algorithm implementation
      if (quality >= 3) {
        if (item.repetitionCount === 0) {
          item.interval = 1;
        } else if (item.repetitionCount === 1) {
          item.interval = 6;
        } else {
          item.interval = Math.round(item.interval * item.easinessFactor);
        }
        item.repetitionCount += 1;
      } else {
        item.repetitionCount = 0;
        item.interval = 1;
      }

      item.easinessFactor = Math.max(1.3, item.easinessFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
      
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + item.interval);
      item.nextReview = nextDate.toISOString();

      const newData = [...prev.srsData];
      if (existingIdx >= 0) {
        newData[existingIdx] = item;
      } else {
        newData.push(item);
      }

      return { ...prev, srsData: newData };
    });
  };

  const getDueReviews = () => {
    const now = new Date();
    return progress.srsData.filter(item => new Date(item.nextReview) <= now);
  };

  const getRank = (points: number) => {
    if (points > 500) return 'Maestro del Mundo';
    if (points > 200) return 'Políglota Erudito';
    if (points > 100) return 'Viajero Incansable';
    return 'Buscador de Sabiduría';
  };

  const level = Math.floor(progress.points / 100) + 1;

  const [showQuiz, setShowQuiz] = useState(false);
  const [showDeepDive, setShowDeepDive] = useState(false);
  const [hasStudiedDeeply, setHasStudiedDeeply] = useState(false);
  const [hasStudiedStoryDeeply, setHasStudiedStoryDeeply] = useState(false);
  const [showFlashcards, setShowFlashcards] = useState(false);
  const [hearts, setHearts] = useState(5);
  const [quizAnswered, setQuizAnswered] = useState<string | null>(null);

  const handleLevelUp = () => {
    // Existing points increase
  };


  const handleAnswer = (option: string) => {
    if (option === lesson?.exercises[currentExerciseIdx].correctAnswer) {
      // Correct!
    } else {
      setHearts(prev => Math.max(0, prev - 1));
    }
  };
  const [pronunciationScore, setPronunciationScore] = useState<number | null>(null);
  const [lastTranscript, setLastTranscript] = useState<string>('');
  const recognitionRef = useRef<any>(null);

  const calculateAccuracy = (original: string, recognized: string) => {
    const s1 = original.toLowerCase().trim();
    const s2 = recognized.toLowerCase().trim();
    if (s1 === s2) return 100;
    
    // Simple word overlap calculation
    const words1 = s1.split(/\s+/);
    const words2 = s2.split(/\s+/);
    const matches = words1.filter(w => words2.includes(w)).length;
    return Math.round((matches / words1.length) * 100);
  };

  const filteredLanguages = useMemo(() => {
    return POPULAR_LANGUAGES.filter(lang => 
      lang.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      lang.nativeName.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  const handleGlobalAction = async (type: 'lesson' | 'story') => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      const lang = await findLanguageBySearch(searchQuery);
      if (lang) {
        if (type === 'lesson') {
          startLesson(lang, selectedCategory);
        } else {
          startStory(lang);
        }
      } else {
        alert("Idioma no encontrado. Intenta con otro nombre.");
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleGlobalSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      const lang = await findLanguageBySearch(searchQuery);
      if (lang) {
        startLesson(lang, selectedCategory);
      } else {
        alert("Idioma no encontrado. Intenta con otro nombre.");
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const startStory = async (lang: Language) => {
    setLoading(true);
    setSelectedLanguage(lang);
    setStory(null);
    setStoryImage(null);
    setShowStoryQuiz(false);
    setCurrentStoryQuestionIdx(0);
    setStoryQuizAnswered(null);
    try {
      const content = await generateStory(lang);
      setStory(content);
      setScreen('story');
      const img = await generateVisualForWord(content.imagePrompt);
      setStoryImage(img);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const startLivePractice = (lang: Language) => {
    setSelectedLanguage(lang);
    setScreen('live_practice');
  };

  const [isJoiningClass, setIsJoiningClass] = useState(false);
  const [joinCode, setJoinCode] = useState('');

  const handleJoinClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (joinCode.trim().length < 4) {
      alert("Por favor ingresa un código válido.");
      return;
    }
    
    setLoading(true);
    try {
      const q = query(collection(db, 'classrooms'), where('code', '==', joinCode.toUpperCase()), where('status', '==', 'active'), limit(1));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        alert("Código de clase no encontrado o clase inactiva.");
        setLoading(false);
        return;
      }

      const classroomDoc = snapshot.docs[0];
      const classroomId = classroomDoc.id;

      // Add student to classroom subcollection
      const studentId = auth.currentUser?.uid || `anon-${Math.random().toString(36).substring(2, 7)}`;
      const studentRef = doc(db, 'classrooms', classroomId, 'students', studentId);
      
      await setDoc(studentRef, {
        userId: auth.currentUser?.uid || null,
        teacherId: classroomDoc.data().teacherId,
        name: progress.displayName || 'Estudiante Invitado',
        joinedAt: new Date().toISOString(),
        progress: 0,
        active: true
      });

      alert(`¡Bienvenido! Te has unido exitosamente al aula de ${classroomDoc.data().language}.`);
      setIsJoiningClass(false);
      setJoinCode('');
      
      // Optionally switch to a "Live Class" view
      // For now, we just acknowledge
    } catch (error) {
      console.error(error);
      alert("Error al unirse a la clase.");
    } finally {
      setLoading(false);
    }
  };

  const startLesson = async (lang: Language, cat: string) => {
    if (hearts <= 0) {
      alert("¡No tienes más corazones! Espera un poco o canjea puntos.");
      return;
    }
    setLoading(true);
    setSelectedLanguage(lang);
    setSelectedCategory(cat);
    setCurrentExerciseIdx(0);
    setShowQuiz(false);
    setQuizAnswered(null);
    setLessonImage('');
    setQuotaExceeded(false);
    try {
      const content = await generateLesson(lang, cat);
      setLesson(content);
      setScreen('lesson');
      const img = await generateVisualForWord(content.contextImagePrompt);
      setLessonImage(img);
    } catch (error: any) {
      console.error(error);
      if (error?.message?.includes("RESOURCE_EXHAUSTED") || error?.status === "RESOURCE_EXHAUSTED") {
        setQuotaExceeded(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const updateQuest = (id: string, amount: number = 1) => {
    setProgress(prev => {
      const newQuests = prev.quests.map(q => {
        if (q.id === id && !q.completed) {
          const newCurrent = q.current + amount;
          const completed = newCurrent >= q.target;
          return { ...q, current: newCurrent, completed };
        }
        return q;
      });
      return { ...prev, quests: newQuests };
    });
  };

  const handleSendMessage = async () => {
    if (!userMsg.trim() || !selectedLanguage) return;
    const currentMsg = userMsg;
    const newHistory: ChatMessage[] = [...chatHistory, { role: 'user', text: currentMsg }];
    setChatHistory(newHistory);
    setUserMsg('');
    setLoading(true);
    setConversationAnalysis(null);
    try {
      const [response, analysis] = await Promise.all([
        generateTutorResponse(selectedLanguage, chatHistory, currentMsg, selectedScenario.name, selectedPersona),
        analyzeConversationAndFeedback(selectedLanguage, currentMsg, selectedScenario.name)
      ]);
      setChatHistory([...newHistory, { role: 'model', text: response }]);
      setConversationAnalysis(analysis);
      updateQuest('q3');

      if (isVoiceMode) {
        setIsSpeaking(true);
        const audioUrl = await generateAudio(response);
        if (audioUrl) {
          const audio = new Audio(audioUrl);
          audio.onended = () => {
            setIsSpeaking(false);
            // Auto start recording after AI finishes speaking in voice mode
            // setTimeout giving browser time to settle
            setTimeout(() => {
              if (screen === 'tutor' && isVoiceMode) {
                startSpeechRecognition((text) => setUserMsg(text), true);
              }
            }, 500);
          };
          audio.play();
        } else {
          setIsSpeaking(false);
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const completeLesson = () => {
    if (!lesson) return;
    updateSRS(lesson.word, lesson.translation, selectedLanguage?.code || 'es', 5);
    setProgress(prev => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const last = prev.lastLogin ? new Date(prev.lastLogin) : null;
      if (last) last.setHours(0, 0, 0, 0);

      const isNewDay = !last || today.getTime() > last.getTime();
      const newStreak = isNewDay ? prev.streak + 1 : prev.streak;

      const isFirst = prev.completedLessons.length === 0;
      const newAchievements = prev.achievements.map(a => {
        if (a.id === 'first' && isFirst) return { ...a, unlocked: true };
        return a;
      });

      return {
        ...prev,
        points: prev.points + 25,
        completedLessons: [...prev.completedLessons, `${selectedLanguage?.name || 'Unknown'}:${lesson.word}`],
        completedTopics: Array.from(new Set([...prev.completedTopics, `${selectedLanguage?.code || 'en'}:${selectedCategory}`])),
        achievements: newAchievements,
        streak: newStreak,
        lastLogin: new Date().toISOString()
      };
    });
    updateQuest('q1');
    setScreen('complete');
  };

  const completeStory = () => {
    setProgress(prev => ({
      ...prev,
      points: prev.points + 20
    }));
    setScreen('complete');
  };

  const nextExercise = () => {
    if (!lesson || !lesson.exercises) {
      completeLesson();
      return;
    }
    if (currentExerciseIdx < (lesson.exercises.length || 0) - 1) {
      setCurrentExerciseIdx(prev => prev + 1);
      setQuizAnswered(null);
    } else {
      completeLesson();
    }
  };

  const startSpeechRecognition = (onResult: (text: string) => void, autoSend: boolean = false) => {
    if (isRecording && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.error("Error stopping recognition:", e);
      }
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Tu navegador no soporta el reconocimiento de voz.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = selectedLanguage?.code || 'es';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setIsRecording(true);
    recognition.onend = () => {
      setIsRecording(false);
      recognitionRef.current = null;
    };
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      onResult(transcript);
      if (autoSend) {
        // Use a slight delay to allow state to update or just pass transcript directly if needed
        setTimeout(() => {
           const sendBtn = document.getElementById('send-message-btn');
           if (sendBtn) sendBtn.click();
        }, 100);
      }
    };
    recognition.onerror = (event: any) => {
      if (event.error !== 'aborted') {
        console.error("Speech recognition error", event.error);
      }
      setIsRecording(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
    } catch (e) {
      console.error("Speech start error:", e);
      setIsRecording(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream font-sans text-charcoal">
      <nav className="sticky top-0 z-50 glass px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setScreen('landing')}>
            <div className="bg-brand-primary p-2 rounded-xl text-white shadow-sm">
              <Languages size={24} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight font-serif text-brand-primary">Linguo</h1>
          </div>

          <button
            onClick={() => {
              if (!selectedLanguage) {
                // If no language has been selected yet, select English by default so the chat works immediately
                const defaultLang = POPULAR_LANGUAGES[0];
                setSelectedLanguage(defaultLang);
              }
              setScreen('tutor');
            }}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full font-extrabold text-[10px] sm:text-xs uppercase tracking-wider transition-all border ${
              screen === 'tutor'
                ? 'bg-brand-primary/10 text-brand-primary border-brand-primary/25 font-black'
                : 'bg-transparent text-slate-text border-transparent hover:bg-black/5 hover:text-charcoal'
            }`}
          >
            <MessageCircle size={12} className="text-brand-primary" />
            <span>Tutor IA</span>
            {selectedLanguage && (
              <span className="text-[10px] px-1 bg-brand-primary/10 text-brand-primary rounded font-extrabold ml-1">
                {selectedLanguage.code.toUpperCase()}
              </span>
            )}
            <span className="flex h-1.5 w-1.5 relative ml-1">
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-brand-secondary"></span>
            </span>
          </button>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-4 py-2 bg-red-500/10 rounded-full text-red-500 font-black border border-red-500/20 shadow-sm">
              <Heart size={16} fill="currentColor" />
              <span>{hearts}</span>
            </div>
            <div className="flex items-center gap-1.5 px-4 py-2 bg-brand-primary/10 rounded-full text-brand-primary font-black border border-brand-primary/20 shadow-sm">
              <Zap size={16} fill="currentColor" />
              <span>{progress.points}</span>
            </div>
          </div>
          <button 
            onClick={() => setShowFlashcards(true)}
            className="bg-brand-accent p-2 rounded-full hover:bg-slate-200 transition-colors text-brand-primary relative group"
          >
            <Layers size={20} />
            {progress.srsData.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-brand-secondary text-white text-[8px] flex items-center justify-center rounded-full animate-bounce">
                {progress.srsData.length}
              </span>
            )}
          </button>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          {quotaExceeded && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-8 p-8 rounded-[40px] bg-brand-secondary/10 border-2 border-brand-secondary/20 flex flex-col items-center text-center gap-4 relative overflow-hidden"
            >
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-brand-secondary/5 rounded-full blur-3xl" />
              <div className="w-16 h-16 rounded-3xl bg-white shadow-xl flex items-center justify-center text-3xl mb-2">😴</div>
              <div>
                <h3 className="text-xl font-bold font-serif text-brand-secondary mb-2">¡El Tutor está tomando una siesta!</h3>
                <p className="text-sm text-slate-text max-w-md mx-auto leading-relaxed">
                  Hemos superado el límite de sabiduría por hoy. El tutor está descansando para volver con más energía mañana. 
                  <span className="block mt-2 font-bold text-brand-primary">¡Sigue practicando con lo que ya has aprendido!</span>
                </p>
              </div>
              <button 
                onClick={() => setQuotaExceeded(false)}
                className="mt-2 text-xs font-black uppercase tracking-[0.2em] text-brand-secondary hover:text-brand-primary transition-colors"
              >
                Entendido
              </button>
            </motion.div>
          )}


          {screen === 'landing' && (
            <motion.div
              key="landing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-12"
            >
              <div className="text-center space-y-6">
                <h2 className="text-5xl sm:text-6xl font-black tracking-tight text-charcoal leading-tight">
                  Aprende <span className="text-brand-secondary italic">cualquier</span> idioma.
                </h2>
                <p className="text-slate-text max-w-xl mx-auto text-lg leading-relaxed">
                  Elige entre más de 140 idiomas y comienza tu viaje de aprendizaje impulsado por IA con tonos naturales y estudio intuitivo.
                </p>
              </div>

              <div className="relative max-w-md mx-auto">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-primary/50" size={20} />
                <input
                  type="text"
                  placeholder="¿Espera, quieres aprender Quechua?"
                  className="w-full bg-white border border-black/10 rounded-full py-4 pl-12 pr-4 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/10 transition-all font-medium"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleGlobalSearch()}
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-6">
                {filteredLanguages.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => startLesson(lang, selectedCategory)}
                    className="flex flex-col items-center gap-3 p-6 card-natural group text-charcoal"
                  >
                    <span className="text-4xl group-hover:scale-125 transition-transform duration-500">{lang.flag}</span>
                    <div className="text-center">
                      <div className="font-bold text-sm tracking-tight">{lang.name}</div>
                      <div className="text-slate-text text-xs font-medium">{lang.nativeName}</div>
                    </div>
                  </button>
                ))}
                {filteredLanguages.length === 0 && searchQuery && (
                  <div className="col-span-full space-y-4">
                    <div className="py-8 border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center gap-2 text-slate-400">
                      <Search size={32} />
                      <div className="font-bold uppercase tracking-widest text-xs">No lo veo en la lista rápida</div>
                      <div className="text-sm">Busca "{searchQuery}" para generar contenido a medida:</div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <button 
                        onClick={() => handleGlobalAction('lesson')}
                        className="flex items-center justify-center gap-3 p-6 bg-brand-primary text-white rounded-3xl font-bold shadow-lg shadow-brand-primary/20 hover:scale-[1.02] transition-all"
                      >
                        <BookOpen size={20} />
                        Crear Lección de {searchQuery}
                      </button>
                      <button 
                        onClick={() => handleGlobalAction('story')}
                        className="flex items-center justify-center gap-3 p-6 bg-brand-secondary text-white rounded-3xl font-bold shadow-lg shadow-brand-secondary/20 hover:scale-[1.02] transition-all"
                      >
                        <Sparkles size={20} />
                        Generar Historia en {searchQuery}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-12">
                <div className="md:col-span-2 space-y-6">
                  {getDueReviews().length > 0 && (
                    <button 
                      onClick={() => setScreen('review')}
                      className="w-full p-8 rounded-[40px] bg-gradient-to-br from-brand-secondary to-brand-primary text-white flex items-center justify-between shadow-xl shadow-brand-secondary/20 group hover:scale-[1.02] transition-all"
                    >
                      <div className="flex items-center gap-6">
                        <div className="p-4 bg-white/20 rounded-3xl backdrop-blur-md">
                          <RefreshCw size={32} />
                        </div>
                        <div className="text-left">
                          <h4 className="text-2xl font-black font-serif">Repaso Diario</h4>
                          <p className="text-white/80 font-medium">{getDueReviews().length} palabras listas para fortalecer.</p>
                        </div>
                      </div>
                      <div className="bg-white/20 p-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                        <ChevronRight size={24} />
                      </div>
                    </button>
                  )}

                  <h3 className="text-xl font-bold font-serif flex items-center gap-2">
                    <Zap size={20} className="text-brand-secondary" />
                    Misiones del día
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {progress.quests.map(quest => (
                      <div key={quest.id} className={`p-5 rounded-[24px] border border-black/5 flex items-center justify-between shadow-sm transition-all ${quest.completed ? 'bg-brand-primary/10 border-brand-primary/20' : 'bg-white'}`}>
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${quest.completed ? 'bg-brand-primary text-white' : 'bg-brand-accent text-brand-primary'}`}>
                            {quest.completed ? <CheckCircle2 size={20} /> : <Star size={20} />}
                          </div>
                          <div>
                            <div className="text-sm font-bold text-charcoal">{quest.description}</div>
                            <div className="text-[10px] uppercase font-bold text-slate-text mt-1">
                              {quest.current} / {quest.target} • +{quest.reward} XP
                            </div>
                          </div>
                        </div>
                        {!quest.completed && (
                          <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-brand-primary" style={{ width: `${(quest.current / quest.target) * 100}%` }} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="pt-6">
                    <h3 className="text-xl font-bold font-serif mb-6 flex items-center gap-2">
                      <Trophy size={20} className="text-brand-primary" />
                      Liga Global de Hoy
                    </h3>
                    <div className="bg-white rounded-[32px] border border-black/5 overflow-hidden shadow-sm">
                      {leaderboard.map((user, i) => (
                        <div key={user.name} className={`px-6 py-4 flex items-center justify-between transition-colors ${i < 3 ? 'bg-brand-primary/5' : ''}`}>
                          <div className="flex items-center gap-4">
                            <div className="w-8 flex flex-col items-center">
                              <div className="text-sm font-black text-slate-text">{i + 1}</div>
                              {i < 3 && <div className="w-1 h-1 rounded-full bg-brand-secondary mt-1" />}
                            </div>
                            <img src={user.avatar} className="w-10 h-10 rounded-xl bg-brand-accent/50 shadow-inner" alt="" />
                            <div>
                              <div className="font-bold text-sm text-charcoal">{user.name}</div>
                              <div className="text-[10px] uppercase font-black text-brand-secondary tracking-widest">{i < 3 ? 'Top ' + (i+1) : 'Competidor'}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <div className="text-sm font-black text-charcoal">{user.points}</div>
                              <div className="text-[10px] font-bold text-slate-text uppercase">XP</div>
                            </div>
                            {i === 0 && <span className="text-xl drop-shadow-sm">👑</span>}
                          </div>
                        </div>
                      ))}
                        <div className="bg-brand-primary/10 p-4 border-t border-brand-primary/10">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-8 text-center text-sm font-black text-brand-primary">#{Math.floor(progress.points / 100) + 1}</div>
                            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${progress.avatarSeed}`} className="w-10 h-10 rounded-xl bg-brand-primary/20 shadow-inner" alt="" />
                            <div className="text-sm font-bold text-brand-primary truncate max-w-[120px]">{progress.displayName}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-black text-brand-primary">{progress.points}</div>
                            <div className="text-[10px] font-bold text-brand-primary uppercase">XP</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                <div className="pt-8">
                  <h3 className="text-xl font-bold font-serif mb-6 flex items-center gap-2">
                    <Sparkles size={20} className="text-brand-secondary" />
                    Inspiración Semanal
                  </h3>
                  <div className="bg-white rounded-[40px] p-8 border border-black/5 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform">
                      <BookOpen size={120} />
                    </div>
                    <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
                      <div className="w-full md:w-1/3 aspect-video bg-brand-accent rounded-3xl flex items-center justify-center text-4xl shadow-inner">
                        📖
                      </div>
                      <div className="flex-1 space-y-4">
                        <h4 className="text-2xl font-black font-serif text-charcoal">Historias que cobran vida</h4>
                        <p className="text-slate-text font-medium leading-relaxed">
                          Deja que nuestra IA invente una historia fascinante en el idioma que elijas. Practica la lectura, escucha diálogos y visualiza el mundo.
                        </p>
                        <div className="flex flex-wrap gap-3">
                          {POPULAR_LANGUAGES.map(lang => (
                            <button 
                              key={lang.code}
                              onClick={() => startStory(lang)}
                              className="px-4 py-2 bg-brand-primary/5 hover:bg-brand-primary/10 text-brand-primary rounded-full text-xs font-bold transition-all border border-brand-primary/10 flex items-center gap-2"
                            >
                              <span>{lang.flag}</span>
                              {lang.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-8">
                  <h3 className="text-xl font-bold font-serif mb-6 flex items-center gap-2">
                    <Mic size={20} className="text-brand-primary" />
                    Práctica en Tiempo Real
                  </h3>
                  <div className="bg-white rounded-[40px] p-8 border border-black/5 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform">
                      <Mic size={120} />
                    </div>
                    <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
                      <div className="w-full md:w-1/3 aspect-video bg-brand-primary/10 rounded-3xl flex items-center justify-center text-4xl shadow-inner text-brand-primary">
                        🎙️
                      </div>
                      <div className="flex-1 space-y-4">
                        <h4 className="text-2xl font-black font-serif text-charcoal">Videollamada con IA</h4>
                        <p className="text-slate-text font-medium leading-relaxed">
                          Practica en tiempo real con nuestra IA multimodal. Una experiencia inmersiva para mejorar tu fluidez.
                        </p>
                        <div className="flex flex-wrap gap-3">
                          {POPULAR_LANGUAGES.map(lang => (
                            <button 
                              key={lang.code}
                              onClick={() => startLivePractice(lang)}
                              className="px-4 py-2 bg-brand-secondary/5 hover:bg-brand-secondary/10 text-brand-secondary rounded-full text-xs font-bold transition-all border border-brand-secondary/10 flex items-center gap-2"
                            >
                              <span>{lang.flag}</span>
                              {lang.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              </div>

              <div className="space-y-6">
                <h3 className="text-xl font-bold font-serif flex items-center gap-2">
                  <Trophy size={20} className="text-brand-primary" />
                  Logros
                </h3>
                  <div className="space-y-3">
                    {progress.achievements.map(ach => (
                      <div key={ach.id} className={`p-4 rounded-[20px] border border-black/5 flex items-center gap-4 ${ach.unlocked ? 'bg-white' : 'grayscale opacity-50'}`}>
                        <div className="text-2xl">{ach.icon}</div>
                        <div>
                          <div className="text-xs font-bold text-charcoal">{ach.name}</div>
                          <div className="text-[10px] text-slate-text">{ach.description}</div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-4 pt-4">
                <div className="bg-brand-secondary/10 px-6 py-4 rounded-[28px] flex items-center gap-3 border border-brand-secondary/10 shadow-sm">
                  <span className="text-2xl">🌍</span>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-brand-secondary tracking-widest">Nivel de Sabiduría</div>
                    <div className="font-bold text-lg">Nivel {progress.level}</div>
                  </div>
                </div>
                <div className="bg-brand-primary/10 px-6 py-4 rounded-[28px] flex items-center gap-3 border border-brand-primary/10 shadow-sm">
                  <span className="text-2xl">📚</span>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-brand-primary tracking-widest">Palabras Maestras</div>
                    <div className="font-bold text-lg font-serif">{progress.completedLessons.length}</div>
                  </div>
                </div>
              </div>


              <div className="pt-2">
                <div 
                  className="w-full p-6 bg-white border border-brand-primary/20 rounded-[32px] flex items-center gap-4 transition-all"
                >
                  <img 
                    src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${progress.avatarSeed}`} 
                    className="w-16 h-16 rounded-2xl bg-brand-primary/10 shadow-inner" 
                    alt="Avatar" 
                  />
                  <div className="text-left overflow-hidden">
                    <h4 className="font-black text-xl text-brand-primary truncate">{progress.displayName}</h4>
                    <p className="text-sm text-slate-text font-medium italic truncate">"{progress.slogan}"</p>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <h3 className="text-xl font-bold font-serif mb-6 flex items-center gap-2">
                  <BookOpen size={20} className="text-brand-secondary" />
                  Categorías de aprendizaje
                </h3>
                <div className="flex flex-wrap gap-3">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-6 py-3 rounded-full text-sm font-bold transition-all shadow-sm border ${
                        selectedCategory === cat 
                          ? 'bg-brand-primary text-white border-brand-primary' 
                          : 'bg-white text-slate-text border-black/5 hover:border-brand-primary/30'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="hero-clay p-8 flex flex-col sm:flex-row items-center justify-between gap-6 overflow-hidden relative">
                <div className="flex items-center gap-6 relative z-10">
                  <div className="bg-white/20 p-4 rounded-2xl backdrop-blur-md shadow-sm ring-1 ring-white/30">
                    <MessageSquare size={32} className="text-white" />
                  </div>
                  <div>
                    <h4 className="text-2xl font-black font-serif text-white">Práctica Conversacional</h4>
                    <p className="text-white/80 font-medium">Habla con tu tutor IA sobre los temas que has dominado.</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    if (progress.completedTopics.length > 0) {
                      setScreen('tutor');
                    } else {
                      alert("Domina al menos un tema (lección) para desbloquear al Tutor.");
                    }
                  }}
                  className={`relative z-10 px-10 py-4 rounded-full font-black text-sm transition-all shadow-xl ${
                    progress.completedTopics.length > 0 
                    ? 'bg-white text-brand-primary hover:bg-cream hover:scale-105' 
                    : 'bg-white/50 text-white/50 cursor-not-allowed'
                  }`}
                >
                  {progress.completedTopics.length > 0 ? 'Hablar ahora' : '🔒 Bloqueado'}
                </button>
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
              </div>

                {progress.srsData.length > 0 && (
                  <div className="pt-12">
                    <h3 className="text-xl font-bold font-serif mb-6 flex items-center gap-2">
                      <Trophy size={20} className="text-brand-secondary" />
                      Mi Biblioteca ({progress.srsData.length})
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {progress.srsData.slice(-4).reverse().map((item, i) => (
                        <div key={i} className="card-natural p-6 flex justify-between items-center bg-white/50 border-dashed border-2">
                          <div>
                            <div className="text-xs font-bold text-brand-primary uppercase tracking-widest">{item.languageCode}</div>
                            <div className="font-bold text-xl font-serif">{item.word}</div>
                          </div>
                          <div className="text-slate-text italic font-medium">{item.translation}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              <div className="pt-20 border-t border-black/5">
                <div className="bg-slate-900 rounded-[40px] p-10 text-white flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-brand-primary/10 rounded-full blur-3xl -mr-32 -mt-32 group-hover:scale-150 transition-transform duration-700" />
                  <div className="relative z-10 space-y-4 text-center md:text-left">
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand-primary/20 rounded-full text-[10px] font-black uppercase tracking-widest text-brand-primary border border-brand-primary/20">
                      <GraduationCap size={12} /> Nuevo: Linguo for Institutions
                    </div>
                    <h3 className="text-3xl font-black font-serif leading-tight">Potencia el aula de idiomas con IA</h3>
                    <p className="text-white/60 max-w-md font-medium">Control docente, analíticas en tiempo real y personalización curricular para colegios y universidades.</p>
                  </div>
                  <div className="flex flex-col sm:flex-row items-center gap-4 relative z-10">
                    <button 
                      onClick={() => setScreen('institution')}
                      className="w-full sm:w-auto px-8 py-5 bg-brand-primary text-white rounded-full font-black text-lg shadow-2xl shadow-brand-primary/20 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3"
                    >
                      Explorar Portal <ChevronRight size={24} />
                    </button>
                    <button 
                      onClick={() => setIsJoiningClass(true)}
                      className="w-full sm:w-auto px-8 py-5 bg-white/10 text-white border border-white/20 rounded-full font-black text-lg hover:bg-white/20 transition-all flex items-center justify-center gap-3"
                    >
                      <Users size={24} /> Unirse a Clase
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Join Class Modal */}
          {isJoiningClass && (
            <div className="fixed inset-0 z-[600] bg-charcoal/60 backdrop-blur-xl flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="bg-white w-full max-w-md rounded-[40px] p-10 shadow-2xl relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-brand-primary/5 rounded-full blur-3xl -mr-16 -mt-16" />
                
                <div className="text-center space-y-6">
                  <div className="w-20 h-20 bg-brand-primary/10 text-brand-primary rounded-3xl flex items-center justify-center mx-auto shadow-inner">
                    <Users size={40} />
                  </div>
                  <div>
                    <h3 className="text-3xl font-black font-serif text-charcoal">Ingresar al Aula</h3>
                    <p className="text-slate-text font-medium mt-2">Pídele a tu profesor el código de 6 dígitos para unirte a la sesión en vivo.</p>
                  </div>

                  <form onSubmit={handleJoinClass} className="space-y-4">
                    <input 
                      type="text"
                      maxLength={6}
                      placeholder="CÓDIGO"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      className="w-full bg-slate-50 border-2 border-brand-primary/10 rounded-2xl py-6 text-center text-4xl font-black font-mono tracking-[0.5em] text-brand-primary focus:border-brand-primary focus:ring-0 transition-all uppercase"
                    />
                    <div className="flex gap-4">
                      <button 
                        type="button"
                        onClick={() => setIsJoiningClass(false)}
                        className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-all"
                      >
                        Cancelar
                      </button>
                      <button 
                        type="submit"
                        className="flex-[2] py-4 bg-brand-primary text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-brand-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
                      >
                        Validar Código
                      </button>
                    </div>
                  </form>
                </div>
              </motion.div>
            </div>
          )}

          {screen === 'lesson' && lesson && selectedLanguage && (
            <motion.div
              key="lesson"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-4 mb-2">
                <button 
                  onClick={() => setScreen('landing')}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <ArrowLeft size={20} />
                </button>
                <div className="flex-1 h-3 bg-brand-accent rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${((currentExerciseIdx + 1) / ((lesson?.exercises?.length || 0) + 1)) * 100}%` }}
                    className="h-full bg-brand-primary"
                  />
                </div>
                <div className="text-[10px] font-black text-brand-primary uppercase tracking-widest">
                  Etapa {currentExerciseIdx + 1}
                </div>
              </div>

              {!showQuiz ? (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                  <div className="lg:col-span-3 bg-white rounded-[40px] p-10 shadow-xl shadow-black/5 border border-black/5 overflow-hidden relative">
                    <div className="flex justify-between items-start mb-10">
                      <div>
                        <div className="text-brand-primary font-bold uppercase tracking-[0.2em] text-[10px] mb-2">
                          Lección: {lesson.topic}
                        </div>
                        <h2 className="text-5xl font-black font-serif text-charcoal">{lesson.word}</h2>
                        <p className="text-slate-text font-mono mt-2 italic text-xl">/ {lesson.pronunciation} /</p>
                        <div className="flex gap-4 mt-6">
                          <button 
                            onClick={() => speak(lesson.word, selectedLanguage.code)}
                            className="bg-brand-primary text-white p-4 rounded-2xl shadow-lg shadow-brand-primary/20 hover:scale-105 active:scale-95 transition-all"
                          >
                            <Volume2 size={24} />
                          </button>
                          <div className="p-4 bg-brand-accent rounded-2xl border border-black/5 flex-1">
                            <div className="text-[10px] text-brand-primary font-bold uppercase tracking-widest mb-1">Traducción</div>
                            <div className="text-2xl font-bold font-serif">{lesson.translation}</div>
                          </div>
                        </div>
                      </div>
                    </div>

                      <div className="grid md:grid-cols-2 gap-12 items-center">
                        <div className="space-y-6">
                          <div className="text-xs text-slate-text font-black uppercase tracking-[0.2em]">Explicación Teórica</div>
                          <div className="p-8 border-l-4 border-brand-primary bg-brand-primary/5 rounded-r-[32px] shadow-inner">
                            <p className="text-lg font-medium text-charcoal leading-relaxed whitespace-pre-wrap">
                              {lesson.theory || `Hoy aprenderemos sobre "${lesson.topic}". El concepto principal es "${lesson.word}", que significa "${lesson.translation}".`}
                            </p>
                          </div>
                          <div className="text-xs text-slate-text font-black uppercase tracking-[0.2em] pt-4">Ejemplo contextual</div>
                          <div className="p-6 border-l-4 border-brand-secondary bg-brand-accent/30 rounded-r-[24px] italic">
                            <div className="text-xl font-bold text-charcoal mb-2">"{lesson.exampleSentence}"</div>
                            <div className="text-slate-text text-sm">"{lesson.exampleTranslation}"</div>
                          </div>
                        </div>

                      <div className="aspect-square bg-brand-accent rounded-[40px] overflow-hidden relative border border-black/5 shadow-inner">
                        {lessonImage === '' ? (
                          <div className="w-full h-full flex items-center justify-center">
                            <Loader2 className="animate-spin text-brand-primary" size={48} />
                          </div>
                        ) : lessonImage ? (
                          <img src={lessonImage} alt="Visual aid" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-brand-primary/20 bg-white/50">
                            <Sparkles size={64} />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-12 flex justify-end gap-4">
                      {!hasStudiedDeeply ? (
                        <button 
                          onClick={() => setShowDeepDive(true)}
                          className="group bg-brand-secondary text-white px-10 py-5 rounded-full font-black text-lg flex items-center gap-3 shadow-xl shadow-brand-secondary/20 hover:scale-[1.03] transition-all"
                        >
                          <BookOpen size={24} />
                          <span>Aprender a Profundidad</span>
                        </button>
                      ) : (
                        <button 
                          onClick={() => setShowQuiz(true)}
                          className="group bg-brand-primary text-white px-10 py-5 rounded-full font-black text-lg flex items-center gap-3 shadow-xl shadow-brand-primary/20 hover:scale-[1.03] transition-all"
                        >
                          <span>Comenzar Práctica</span>
                          <ChevronRight size={24} className="group-hover:translate-x-1 transition-transform" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-[40px] p-10 shadow-xl border border-brand-primary/10 overflow-hidden relative">
                  <ExerciseRenderer 
                    exercise={lesson.exercises[currentExerciseIdx]}
                    selectedLanguage={selectedLanguage}
                    onCorrect={() => {
                      setTimeout(nextExercise, 1500);
                    }}
                    onIncorrect={() => {
                      setHearts(prev => {
                        const next = Math.max(0, prev - 1);
                        if (next === 0) {
                          setTimeout(() => {
                            alert("¡Oh no! Te has quedado sin corazones. La lección se ha interrumpido.");
                            setScreen('landing');
                            setHearts(5); // Reset for demo purposes or handle as needed
                          }, 500);
                        }
                        return next;
                      });
                    }}
                  />
                </div>
              )}
            </motion.div>
          )}

          {screen === 'review' && (
            <motion.div
              key="review"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[40px] p-12 shadow-2xl border border-black/5 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-8 opacity-5">
                <RefreshCw size={120} />
              </div>
              <div className="relative z-10">
                <button onClick={() => setScreen('landing')} className="mb-8 flex items-center gap-2 text-brand-primary font-bold">
                  <ArrowLeft size={20} /> Volver al Inicio
                </button>
                
                {getDueReviews().length > 0 ? (
                  <ReviewRenderer 
                    items={getDueReviews()} 
                    onFinish={() => setScreen('landing')}
                    onUpdateSRS={updateSRS}
                  />
                ) : (
                  <div className="text-center space-y-6 py-12">
                     <div className="w-24 h-24 bg-brand-primary/10 rounded-[40px] flex items-center justify-center mx-auto text-brand-primary rotate-12">
                       <CheckCircle2 size={48} />
                     </div>
                     <h2 className="text-4xl font-black font-serif text-charcoal">¡Todo al día!</h2>
                     <p className="text-slate-text text-lg max-w-md mx-auto">
                       No tienes más palabras para repasar en este momento. ¡Sigue aprendiendo nuevas lecciones!
                     </p>
                     <button 
                      onClick={() => setScreen('landing')}
                      className="px-12 py-5 bg-brand-primary text-white rounded-full font-black shadow-xl shadow-brand-primary/20 hover:scale-[1.03] active:scale-95 transition-all text-lg"
                     >
                       Volver al Panel
                     </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {screen === 'live_practice' && selectedLanguage && (
            <LivePractice 
              language={selectedLanguage} 
              onClose={() => setScreen('landing')} 
            />
          )}

          {screen === 'institution' && (
            <div className="fixed inset-0 z-[500]">
              <InstitutionPortal onExit={() => setScreen('landing')} />
            </div>
          )}

          {screen === 'story' && story && selectedLanguage && (
            <motion.div
              key="story"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              className="space-y-8"
            >
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setScreen('landing')}
                  className="p-3 bg-white hover:bg-slate-50 rounded-full transition-all border border-black/5 shadow-sm"
                >
                  <ArrowLeft size={24} />
                </button>
                <h2 className="text-3xl font-black font-serif text-charcoal">{story.title}</h2>
              </div>

              <div className="grid md:grid-cols-2 gap-12">
                <div className="space-y-8">
                  {!showStoryQuiz ? (
                    <>
                      <div className="bg-white rounded-[40px] p-10 shadow-xl border border-black/5 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-6 opacity-5">
                          <Sparkles size={100} />
                        </div>
                        <div className="relative z-10 space-y-6">
                          <p className="text-2xl font-serif text-charcoal leading-relaxed italic">
                            "{story.story}"
                          </p>
                          <hr className="border-black/5" />
                          <p className="text-slate-text font-medium leading-relaxed">
                            {story.translation}
                          </p>
                          <button 
                            onClick={() => speak(story.story, selectedLanguage.code)}
                            className="w-full py-4 bg-brand-primary text-white rounded-2xl font-black flex items-center justify-center gap-3 shadow-lg shadow-brand-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
                          >
                            <Volume2 size={24} /> Escuchar historia
                          </button>
                        </div>
                      </div>

                      <div className="space-y-6">
                        <h3 className="text-xl font-bold font-serif flex items-center gap-2">
                          <MessageSquare size={20} className="text-brand-secondary" />
                          Diálogos de la escena
                        </h3>
                        <div className="space-y-4">
                          {story.dialogues.map((d, i) => (
                            <motion.div 
                              key={i}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.1 }}
                              className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm flex flex-col gap-3 group relative overflow-hidden"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black text-brand-primary uppercase tracking-widest">{d.character}</span>
                                <button 
                                  onClick={() => speak(d.text, selectedLanguage.code)}
                                  className="p-2 bg-brand-accent/50 text-brand-primary rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <Volume2 size={16} />
                                </button>
                              </div>
                              <p className="text-lg font-bold text-charcoal italic">"{d.text}"</p>
                              <p className="text-xs text-slate-text italic">"{d.translation}"</p>
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="bg-white rounded-[40px] p-10 shadow-xl border border-brand-primary/10 space-y-8 min-h-[400px]">
                      <div className="flex items-center justify-between">
                        <div className="text-[10px] font-black text-brand-primary uppercase tracking-widest">Pregunta {currentStoryQuestionIdx + 1} de {story.questions.length}</div>
                        <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-brand-primary" style={{ width: `${((currentStoryQuestionIdx + 1) / story.questions.length) * 100}%` }} />
                        </div>
                      </div>
                      
                      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                        <h3 className="text-2xl font-black font-serif text-charcoal">{story.questions[currentStoryQuestionIdx].question}</h3>
                        <div className="grid grid-cols-1 gap-3">
                          {story.questions[currentStoryQuestionIdx].options.map((opt, i) => (
                            <button
                              key={i}
                              onClick={() => {
                                if (storyQuizAnswered) return;
                                setStoryQuizAnswered(opt);
                                if (opt === (story?.questions?.[currentStoryQuestionIdx]?.correctAnswer)) {
                                  setProgress(p => ({ ...p, points: p.points + 5 }));
                                  setTimeout(() => {
                                    if (currentStoryQuestionIdx < (story?.questions?.length || 0) - 1) {
                                      setCurrentStoryQuestionIdx(prev => prev + 1);
                                      setStoryQuizAnswered(null);
                                    } else {
                                      completeStory();
                                    }
                                  }, 1500);
                                }
                              }}
                              className={`p-5 rounded-[24px] border-2 transition-all font-bold text-left ${
                                storyQuizAnswered === opt
                                  ? opt === story.questions[currentStoryQuestionIdx].correctAnswer
                                    ? 'bg-brand-primary/10 border-brand-primary text-brand-primary'
                                    : 'bg-red-50 border-red-200 text-red-500'
                                  : 'bg-cream border-black/5 hover:border-brand-primary'
                              }`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-8">
                  <div className="aspect-[4/5] bg-brand-accent rounded-[40px] overflow-hidden relative border border-black/5 shadow-inner">
                    {storyImage === null ? (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-brand-primary/20">
                        <Loader2 className="animate-spin" size={48} />
                        <span className="font-bold uppercase tracking-widest text-xs">Pintando el mundo...</span>
                      </div>
                    ) : (
                      <motion.img 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        src={storyImage} 
                        alt="Context" 
                        className="w-full h-full object-cover" 
                      />
                    )}
                  </div>
                  
                  {!showStoryQuiz ? (
                    <div className="p-8 bg-brand-secondary/5 border-2 border-brand-secondary/10 rounded-[40px] text-center space-y-4">
                      <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-brand-secondary mx-auto shadow-sm">
                        <Zap size={24} />
                      </div>
                      <h4 className="text-lg font-black font-serif text-brand-secondary">¿Entendiste la historia?</h4>
                      <p className="text-slate-text text-sm font-medium">Antes del quiz, explora el trasfondo y contexto profundo.</p>
                      
                      {!hasStudiedStoryDeeply ? (
                        <button 
                          onClick={() => setShowDeepDive(true)}
                          className="w-full py-4 bg-brand-secondary text-white rounded-full font-black shadow-lg shadow-brand-secondary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                          <BookOpen size={20} />
                          Análisis Profundo
                        </button>
                      ) : (
                        <button 
                          onClick={() => setShowStoryQuiz(true)}
                          className="w-full py-4 bg-brand-primary text-white rounded-full font-black shadow-lg shadow-brand-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                          Hacer el Quiz
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="p-8 bg-brand-primary/5 border-2 border-brand-primary/10 rounded-[40px] text-center space-y-4">
                      <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-brand-primary mx-auto shadow-sm">
                        <BookOpen size={24} />
                      </div>
                      <h4 className="text-lg font-black font-serif text-brand-primary">Volver a leer</h4>
                      <p className="text-slate-text text-sm font-medium">¿Necesitas repasar el texto original?</p>
                      <button 
                        onClick={() => setShowStoryQuiz(false)}
                        className="w-full py-4 bg-brand-primary text-white rounded-full font-black shadow-lg shadow-brand-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
                      >
                        Leer historia de nuevo
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {screen === 'tutor' && selectedLanguage && (
            <motion.div
              key="tutor"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              className="flex flex-col h-[70vh] bg-white rounded-[40px] shadow-2xl border border-black/5 overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-black/5 flex flex-row items-center justify-between bg-white relative z-10 shadow-sm flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <button onClick={() => setScreen('lesson')} className="text-slate-text hover:text-brand-primary transition-colors p-1.5 rounded-full hover:bg-black/5">
                    <ArrowLeft size={20} />
                  </button>
                  <div>
                    <h2 className="text-base font-bold font-serif text-charcoal flex items-center gap-1.5">
                      Tutor de {selectedLanguage.name} <span className="text-xs">{selectedLanguage.flag}</span>
                    </h2>
                  </div>
                </div>

                {/* Compact Minimalist Inline Configuration Controls */}
                <div className="flex items-center gap-2.5 flex-wrap text-xs">
                  {/* Scenario Category Select Dropdown */}
                  <div className="flex items-center gap-1 bg-cream/70 px-2.5 py-1.5 rounded-full border border-black/5">
                    <span className="text-slate-text/80 text-[10px] uppercase font-black tracking-wider">Tema</span>
                    <select
                      value={selectedScenario.id}
                      onChange={(e) => {
                        const sc = TUTOR_SCENARIOS.find(s => s.id === e.target.value);
                        if (sc) {
                          const isLocked = !progress.completedTopics.includes(`${selectedLanguage.code}:${sc.requiredCategory}`);
                          if (!isLocked) {
                            setSelectedScenario(sc);
                            setChatHistory([]);
                          } else {
                            alert(`Completa una lección de "${sc.requiredCategory}" para desbloquear este tema.`);
                          }
                        }
                      }}
                      className="bg-transparent border-none font-bold text-charcoal text-[11px] focus:outline-none pr-1 cursor-pointer"
                    >
                      {TUTOR_SCENARIOS.map(sc => {
                        const isLocked = !progress.completedTopics.includes(`${selectedLanguage.code}:${sc.requiredCategory}`);
                        return (
                          <option key={sc.id} value={sc.id}>
                            {isLocked ? '🔒 ' : ''}{sc.icon} {sc.name}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* Persona Mode Select Dropdown */}
                  <div className="flex items-center gap-1 bg-cream/70 px-2.5 py-1.5 rounded-full border border-black/5">
                    <span className="text-slate-text/80 text-[10px] uppercase font-black tracking-wider">Estilo</span>
                    <select
                      value={selectedPersona}
                      onChange={(e) => {
                        setSelectedPersona(e.target.value);
                        setChatHistory([]);
                      }}
                      className="bg-transparent border-none font-bold text-charcoal text-[11px] focus:outline-none pr-1 cursor-pointer"
                    >
                      {TUTOR_PERSONAS.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.icon} {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Voice Activation Toggle Button */}
                  <button 
                    onClick={() => setIsVoiceMode(!isVoiceMode)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider transition-all border ${
                      isVoiceMode 
                      ? 'bg-brand-primary text-white border-brand-primary shadow-sm shadow-brand-primary/10' 
                      : 'bg-brand-accent text-brand-primary border-transparent hover:bg-brand-accent/80'
                    }`}
                  >
                    {isVoiceMode ? <Headphones size={12} className="text-white" /> : <Ear size={12} />}
                    <span>{isVoiceMode ? (isSpeaking ? 'Habla...' : isRecording ? 'Oigo...' : 'Voz On') : 'Voz Off'}</span>
                  </button>

                  {(isSpeaking || isRecording) && (
                    <div className="flex gap-0.5 items-center px-1">
                      {[1, 2, 3].map(i => (
                        <motion.div
                          key={i}
                          animate={{ height: [6, 14, 6] }}
                          transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.1 }}
                          className={`w-0.5 rounded-full ${isSpeaking ? 'bg-brand-secondary' : 'bg-red-500'}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-6 bg-cream/30">
                {(!selectedLanguage || !progress.completedTopics.includes(`${selectedLanguage.code}:${selectedScenario.requiredCategory}`)) ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-4">
                    <div className="w-20 h-20 bg-slate-200 rounded-full flex items-center justify-center text-4xl shadow-inner">🔒</div>
                    <h3 className="text-xl font-bold font-serif text-charcoal">Escenario Bloqueado</h3>
                    <p className="text-slate-text max-w-xs mx-auto">
                      Completa una lección de <span className="font-bold text-brand-primary">"{selectedScenario.requiredCategory}"</span> para desbloquear esta conversación.
                    </p>
                    <button 
                      onClick={() => startLesson(selectedLanguage as Language, selectedScenario.requiredCategory)}
                      className="px-6 py-2 bg-brand-primary text-white rounded-full font-bold text-sm shadow-lg shadow-brand-primary/20"
                    >
                      Empezar Lección
                    </button>
                  </div>
                ) : chatHistory.length === 0 && (
                  <div className="text-center py-16 space-y-6">
                    <div className="w-20 h-20 bg-brand-primary/10 rounded-[32px] flex items-center justify-center mx-auto text-brand-primary rotate-3">
                      <Sparkles size={40} />
                    </div>
                    <p className="text-slate-text font-serif text-xl italic max-w-sm mx-auto">
                      "¡Hola! Soy tu guía nativo. ¿Sobre qué te gustaría conversar en {selectedLanguage.name} hoy?"
                    </p>
                  </div>
                )}
                {chatHistory.map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[75%] p-5 rounded-[24px] ${
                      msg.role === 'user' 
                        ? 'bg-brand-primary text-white rounded-tr-none shadow-lg shadow-brand-primary/10' 
                        : 'bg-white border border-black/5 text-charcoal rounded-tl-none shadow-sm font-medium'
                    }`}>
                      {msg.text}
                    </div>
                  </motion.div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-black/5 p-5 rounded-[24px] rounded-tl-none flex items-center gap-3">
                       <Loader2 size={18} className="animate-spin text-brand-primary" />
                       <span className="text-slate-text text-sm font-bold uppercase tracking-widest">Analizando tu respuesta...</span>
                    </div>
                  </div>
                )}

                {conversationAnalysis && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-6 bg-amber-50 border border-amber-100 rounded-[32px] space-y-4 shadow-sm"
                  >
                    <div className="flex items-center gap-3 text-amber-700 font-bold uppercase tracking-widest text-[10px]">
                      <Sparkles size={14} />
                      Feedback sobre tu Gramática y Pronunciación
                    </div>
                    <p className="text-amber-900 font-medium italic text-sm">"{conversationAnalysis.feedback}"</p>
                    <div className="flex flex-wrap gap-2">
                       <span className="text-[10px] font-black text-amber-700/50 uppercase tracking-widest mr-1">Sugerencias:</span>
                      {conversationAnalysis.suggestions.map((s, i) => (
                        <span key={i} className="px-3 py-1 bg-white rounded-full text-[10px] font-bold text-amber-700 border border-amber-100 shadow-sm flex items-center gap-1">
                          <MessageCircle size={10} /> {s}
                        </span>
                      ))}
                    </div>
                  </motion.div>
                )}
              </div>

              <div className="p-6 bg-white border-t border-black/5 flex gap-3">
                {(() => {
                  const isLocked = !selectedLanguage || !progress.completedTopics.includes(`${selectedLanguage.code}:${selectedScenario.requiredCategory}`);
                  return (
                    <>
                      <button
                        onClick={() => startSpeechRecognition((text) => setUserMsg(prev => prev + ' ' + text))}
                        disabled={isLocked}
                        className={`p-4 rounded-full transition-all ${
                          isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-brand-accent text-brand-primary'
                        } ${isLocked ? 'opacity-30 cursor-not-allowed' : ''}`}
                      >
                        {isRecording ? <MicOff size={24} /> : <Mic size={24} />}
                      </button>
                      <input
                        type="text"
                        disabled={isLocked}
                        placeholder={isLocked ? 'Tema bloqueado...' : `Escribe algo en ${selectedLanguage?.name}...`}
                        className={`flex-1 bg-brand-accent border-none rounded-full px-6 py-4 focus:ring-2 focus:ring-brand-primary/20 font-medium placeholder:text-slate-text/50 ${isLocked ? 'cursor-not-allowed' : ''}`}
                        value={userMsg}
                        onChange={(e) => setUserMsg(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                      />
                      <button
                        id="send-message-btn"
                        onClick={handleSendMessage}
                        disabled={loading || !userMsg.trim() || isLocked}
                        className="bg-brand-primary text-white p-4 rounded-full hover:shadow-xl shadow-brand-primary/20 disabled:opacity-50 transition-all active:scale-95"
                      >
                        <Send size={24} />
                      </button>
                    </>
                  );
                })()}
              </div>
            </motion.div>
          )}

          {screen === 'complete' && (
            <motion.div
              key="complete"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center py-16 space-y-10"
            >
              <div className="relative inline-block">
                <div className="absolute inset-0 bg-brand-secondary blur-[100px] opacity-10 rounded-full" />
                <div className="relative bg-white p-12 rounded-[50px] shadow-2xl border border-black/5">
                  <div className="w-24 h-24 bg-brand-accent rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner">
                    <Trophy size={50} className="text-brand-secondary" />
                  </div>
                  <h2 className="text-4xl font-black font-serif mb-3 text-charcoal italic">¡Brillante!</h2>
                  <p className="text-slate-text font-medium text-lg leading-relaxed max-w-xs mx-auto">Has desbloqueado nuevos horizontes con +10 puntos de sabiduría.</p>
                  
                  <div className="mt-12 flex justify-center items-center gap-10">
                    <div className="text-center">
                      <div className="text-4xl font-black text-brand-primary tabular-nums tracking-tighter">{progress.points}</div>
                      <div className="text-[10px] uppercase font-bold text-slate-text tracking-[0.2em] mt-1">Sabiduría Total</div>
                    </div>
                    <div className="w-px h-12 bg-black/5" />
                    <div className="text-center">
                      <div className="text-4xl font-black text-brand-secondary tabular-nums tracking-tighter">{progress.level}</div>
                      <div className="text-[10px] uppercase font-bold text-slate-text tracking-[0.2em] mt-1">Nivel Alcanzado</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-center gap-6">
                <button 
                  onClick={() => setScreen('landing')}
                  className="px-12 py-5 bg-brand-primary text-white font-bold rounded-full shadow-2xl shadow-brand-primary/20 hover:scale-[1.03] transition-all text-lg"
                >
                  Nuevo idioma
                </button>
                <button 
                   onClick={() => {
                     // Check if any scenario is unlocked
                     const hasUnlocked = TUTOR_SCENARIOS.some(sc => 
                       progress.completedTopics.includes(`${selectedLanguage?.code || 'en'}:${sc.requiredCategory}`)
                     );
                     if (hasUnlocked) {
                       setScreen('tutor');
                     } else {
                       setScreen('landing');
                     }
                   }}
                   className="px-12 py-5 bg-white border border-black/10 text-charcoal font-bold rounded-full hover:bg-cream transition-all shadow-sm text-lg"
                >
                  Practicar ahora
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {loading && screen === 'landing' && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm">
          <div className="relative">
            <Loader2 className="animate-spin text-brand-primary" size={64} />
            <Languages className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-brand-primary" size={24} />
          </div>
          <p className="mt-6 font-bold text-lg text-slate-700 animate-pulse">Generando tu lección personalizada...</p>
        </div>
      )}

      {/* Deep Study Modal */}
      {showDeepDive && lesson && screen === 'lesson' && (
        <div className="fixed inset-0 z-[250] bg-charcoal/40 backdrop-blur-md flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white w-full max-w-2xl rounded-[40px] p-10 shadow-2xl relative overflow-hidden"
          >
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-brand-secondary/20 text-brand-secondary rounded-2xl flex items-center justify-center">
                <BookOpen size={24} />
              </div>
              <div>
                <h3 className="text-2xl font-black font-serif text-charcoal">Estudio en Profundidad</h3>
                <p className="text-xs font-black text-brand-secondary uppercase tracking-widest">Maestría de {lesson.word}</p>
              </div>
            </div>
            
            <div className="max-h-[50vh] overflow-y-auto pr-4 space-y-6 text-slate-text leading-relaxed">
              <p className="text-lg first-letter:text-5xl first-letter:font-black first-letter:text-brand-primary first-letter:mr-3 first-letter:float-left">
                {lesson.deepDive}
              </p>
            </div>

            <div className="mt-10 pt-6 border-t border-black/5 flex justify-end">
              <button 
                onClick={() => {
                  setHasStudiedDeeply(true);
                  setShowDeepDive(false);
                }}
                className="px-10 py-4 bg-brand-primary text-white rounded-full font-black text-sm uppercase tracking-widest shadow-xl shadow-brand-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
              >
                He Aprendido con Profundidad
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Story Context Modal */}
      {showDeepDive && story && screen === 'story' && (
        <div className="fixed inset-0 z-[250] bg-charcoal/40 backdrop-blur-md flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white w-full max-w-2xl rounded-[40px] p-10 shadow-2xl relative overflow-hidden"
          >
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-brand-secondary/20 text-brand-secondary rounded-2xl flex items-center justify-center">
                <Sparkles size={24} />
              </div>
              <div>
                <h3 className="text-2xl font-black font-serif text-charcoal">Contexto y Trasfondo</h3>
                <p className="text-xs font-black text-brand-secondary uppercase tracking-widest">Análisis Profundo</p>
              </div>
            </div>
            
            <div className="max-h-[50vh] overflow-y-auto pr-4 space-y-6 text-slate-text leading-relaxed">
               <p className="text-lg">
                {story.culturalContext}
              </p>
            </div>

            <div className="mt-10 pt-6 border-t border-black/5 flex justify-end">
              <button 
                onClick={() => {
                  setHasStudiedStoryDeeply(true);
                  setShowDeepDive(false);
                }}
                className="px-10 py-4 bg-brand-secondary text-white rounded-full font-black text-sm uppercase tracking-widest shadow-xl shadow-brand-secondary/20 hover:scale-[1.02] active:scale-95 transition-all"
              >
                Entendido, estoy listo para el quiz
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Flashcards Modal */}
      {showFlashcards && (
        <div className="fixed inset-0 z-[300] bg-charcoal/40 backdrop-blur-md flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-xl"
          >
            <Flashcards 
              cards={progress.srsData.map(v => ({ word: v.word, translation: v.translation }))} 
              onClose={() => setShowFlashcards(false)} 
            />
          </motion.div>
        </div>
      )}
    </div>
  );
}

