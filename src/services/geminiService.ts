/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from "@google/genai";
import { LessonContent, Language } from "../types";

// Safe cross-platform API key extraction
const clientApiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || 
                     (typeof process !== "undefined" && (process as any).env?.GEMINI_API_KEY) || 
                     "";

// Keep client-side export for LivePractice WebSocket connectivity. Falling back to a placeholder avoids import-time errors.
export const ai = new GoogleGenAI({ 
  apiKey: clientApiKey || 'placeholder_key_to_avoid_load_crash',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

export async function generateLesson(targetLanguage: Language, category: string): Promise<LessonContent> {
  const cacheKey = `lesson_${targetLanguage.code}_${category.toLowerCase()}`;
  try {
    const response = await fetch("/api/gemini/lesson", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetLanguage, category }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    const content = JSON.parse(data.text || '{}') as LessonContent;
    localStorage.setItem(cacheKey, JSON.stringify(content));
    return content;
  } catch (error: any) {
    console.error("Error generating lesson on client:", error);
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      console.log("Serving cached lesson as fallback");
      return JSON.parse(cached);
    }
    throw error;
  }
}

export async function analyzeConversationAndFeedback(
  targetLanguage: Language,
  userText: string,
  scenario: string
) {
  try {
    const response = await fetch("/api/gemini/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetLanguage, userText, scenario }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return JSON.parse(data.text || '{}');
  } catch (error: any) {
    console.error("Error analyzing feedback on client:", error);
    return { feedback: "No pudimos conectar con el servidor para analizar tu gramática.", suggestions: [] };
  }
}

export async function findLanguageBySearch(query: string): Promise<Language | null> {
  try {
    const response = await fetch("/api/gemini/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    const res = JSON.parse(data.text || '{}');
    if (res.found) {
      return {
        code: res.code,
        name: res.name,
        nativeName: res.nativeName,
        flag: res.flag,
      };
    }
  } catch (error: any) {
    console.error("Error searching language on client:", error);
  }
  return null;
}

export async function generateTutorResponse(
  targetLanguage: Language,
  history: { role: 'user' | 'model'; text: string }[],
  userInput: string,
  scenario: string = "Conversación general",
  persona: string = "regular"
): Promise<string> {
  try {
    const response = await fetch("/api/gemini/tutor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetLanguage, history, userInput, scenario, persona }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data.text || "Lo siento, no pude entender eso.";
  } catch (error: any) {
    console.error("Error generating tutor response on client:", error);
    return "Lo siento, tengo problemas de conexión con el aula en este momento.";
  }
}

export async function generateVisualForWord(prompt: string): Promise<string | null> {
  try {
    const response = await fetch("/api/gemini/visual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data.imageUrl;
  } catch (error: any) {
    console.error("Error generating image on client:", error);
    return null;
  }
}

export async function generateAudio(text: string, voiceName: 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr' = 'Zephyr'): Promise<string | null> {
  try {
    const response = await fetch("/api/gemini/audio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voiceName }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data.audioUrl;
  } catch (error: any) {
    console.error("Error generating audio on client:", error);
    return null;
  }
}

export async function generateStory(targetLanguage: Language): Promise<any> {
  try {
    const response = await fetch("/api/gemini/story", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetLanguage }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return JSON.parse(data.text || '{}');
  } catch (error: any) {
    console.error("Error generating story on client:", error);
    return {
      title: "Historia no disponible",
      story: "Por favor, reintenta más tarde.",
      translation: "Intenta de nuevo",
      imagePrompt: "",
      dialogues: [],
      questions: []
    };
  }
}
