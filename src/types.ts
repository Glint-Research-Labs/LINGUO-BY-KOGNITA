/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Language {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
}

export interface Exercise {
  type: 'multiple_choice' | 'fill_in_blank' | 'matching' | 'pronunciation';
  question: string;
  options?: string[];
  correctAnswer: string;
  imagePrompt?: string;
  pairs?: { key: string, value: string }[];
}

export interface LessonContent {
  id: string;
  topic: string;
  word: string;
  translation: string;
  pronunciation: string;
  exampleSentence: string;
  exampleTranslation: string;
  contextImagePrompt: string;
  theory?: string;
  exercises: Exercise[];
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface Quest {
  id: string;
  description: string;
  target: number;
  current: number;
  reward: number;
  completed: boolean;
}

export interface Achievement {
  id: string;
  name: string;
  icon: string;
  description: string;
  unlocked: boolean;
}

export interface SRSItem {
  word: string;
  translation: string;
  languageCode: string; // To track pronunciation language
  difficulty: number; // 0-1
  interval: number; // in days
  easinessFactor: number;
  nextReview: string; // ISO date
  repetitionCount: number;
}

export interface StoryContent {
  title: string;
  story: string;
  translation: string;
  imagePrompt: string;
  dialogues: {
    character: string;
    text: string;
    translation: string;
  }[];
  questions: {
    question: string;
    options: string[];
    correctAnswer: string;
  }[];
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface UserProgress {
  points: number;
  level: number;
  displayName: string;
  avatarSeed: string;
  slogan: string;
  completedLessons: string[];
  completedTopics: string[];
  streak: number;
  lastLogin: string;
  quests: Quest[];
  achievements: Achievement[];
  srsData: SRSItem[];
}
