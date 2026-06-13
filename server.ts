import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type, Modality } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Initialize GoogleGenAI server-side lazily
let aiInstance: GoogleGenAI | null = null;
function getAi(): GoogleGenAI {
  if (!aiInstance) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is not defined on the server.");
    }
    aiInstance = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiInstance;
}

app.use(express.json());

// API routes FIRST
app.post("/api/gemini/lesson", async (req, res) => {
  const { targetLanguage, category } = req.body;
  try {
    const response = await getAi().models.generateContent({
      model: "gemini-3.5-flash",
      contents: `Eres un diseñador de currículos de idiomas. Genera una lección estructurada de ${targetLanguage.name} en la categoría "${category}". 
      
      La lección debe incluir:
      1. Un concepto de gramática o cultura clave explicado extensamente para que el alumno aprenda ANTES de los ejercicios.
      2. Vocabulario relevante.
      3. Frases de conversación prácticas.
      
      La estructura de ejercicios debe ser:
      - 2 de Opción múltiple (uno de gramática, uno de vocabulario).
      - 1 de Completar espacio (phrase builder).
      - 1 de Emparejamiento (matching) con 4 pares.
      - 1 de Pronunciación (frase de conversación).
      
      Devuelve un JSON que siga el esquema proporcionado. Todas las explicaciones deben estar en español.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            topic: { type: Type.STRING },
            theory: { type: Type.STRING, description: "Explicación teórica detallada para que el alumno aprenda antes de practicar" },
            word: { type: Type.STRING, description: "La palabra/frase principal de la lección" },
            translation: { type: Type.STRING },
            pronunciation: { type: Type.STRING },
            exampleSentence: { type: Type.STRING },
            exampleTranslation: { type: Type.STRING },
            contextImagePrompt: { type: Type.STRING },
            exercises: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING, enum: ["multiple_choice", "fill_in_blank", "matching", "pronunciation"] },
                  question: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  correctAnswer: { type: Type.STRING },
                  imagePrompt: { type: Type.STRING },
                  pairs: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        key: { type: Type.STRING },
                        value: { type: Type.STRING }
                      },
                      required: ["key", "value"]
                    }
                  }
                },
                required: ["type", "question", "correctAnswer"]
              }
            }
          },
          required: ["id", "topic", "word", "translation", "pronunciation", "exampleSentence", "exampleTranslation", "contextImagePrompt", "exercises"],
        },
      },
    });

    res.json({ text: response.text });
  } catch (error: any) {
    console.error("Server generateLesson error:", error);
    res.status(500).json({ error: error.message || "Error generating lesson" });
  }
});

app.post("/api/gemini/feedback", async (req, res) => {
  const { targetLanguage, userText, scenario } = req.body;
  try {
    const response = await getAi().models.generateContent({
      model: "gemini-3.5-flash",
      contents: `Analiza la siguiente frase del usuario en ${targetLanguage.name} durante una práctica de "${scenario}":
      "${userText}"
      
      Proporciona retroalimentación constructiva sobre la gramática y el vocabulario. 
      Si hay errores, corrígelos claramente.
      Devuelve un JSON con "feedback" (string) y "suggestions" (array de strings).`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            feedback: { type: Type.STRING },
            suggestions: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["feedback", "suggestions"]
        }
      }
    });

    res.json({ text: response.text });
  } catch (error: any) {
    console.error("Server analyzeConversationAndFeedback error:", error);
    res.status(500).json({ error: error.message || "Error analyzing conversation" });
  }
});

app.post("/api/gemini/search", async (req, res) => {
  const { query: searchQuery } = req.body;
  try {
    const response = await getAi().models.generateContent({
      model: "gemini-3.5-flash",
      contents: `El usuario está buscando un idioma usando la consulta "${searchQuery}". 
      Encuentra el idioma más relevante.
      Si lo encuentras, devuelve sus detalles. Si no, devuelve null. 
      Usa el nombre en español para "name".`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            code: { type: Type.STRING, description: "ISO 2-letter code" },
            name: { type: Type.STRING, description: "English name" },
            nativeName: { type: Type.STRING, description: "Name in that language" },
            flag: { type: Type.STRING, description: "Emoji flag" },
            found: { type: Type.BOOLEAN },
          },
          required: ["found"],
        },
      },
    });

    res.json({ text: response.text });
  } catch (error: any) {
    console.error("Server findLanguageBySearch error:", error);
    res.status(500).json({ error: error.message || "Error finding language" });
  }
});

app.post("/api/gemini/tutor", async (req, res) => {
  const { targetLanguage, history, userInput, scenario, persona } = req.body;
  try {
    let systemInstruction = `Eres un tutor experto de ${targetLanguage.name} para un estudiante que habla español. Tu objetivo es ayudar al usuario a practicar conversación interactiva en el contexto de: "${scenario || 'Conversación general'}".

IMPORTANTE SOBRE LA TRADUCCIÓN: Siempre proporciona la traducción al español de todo lo que digas en ${targetLanguage.name} entre paréntesis (...) al final, para que el usuario pueda comprender perfectamente el significado natural de tus oraciones.`;

    switch (persona) {
      case 'casual':
        systemInstruction += `

PERSONALIDAD: Amigo Casual/Nativo Divertido (hablar de forma no robótica, natural y espontánea).
INSTRUCCIÓN: Habla de manera súper informal, relajada, usando lenguaje cotidiano y modismos reales que usan los jóvenes y hablantes nativos en el día a día (jerga local). Haz bromas o comentarios fluidos. Evita estructuras rígidas de libros de gramática. Limítate a oraciones amigables naturales. Corrige errores de forma juguetona, alentando y respondiendo de manera cálida y muy humana.`;
        break;
      case 'professional':
        systemInstruction += `

PERSONALIDAD: Entrevistador de Trabajo / Profesional de Negocios Corporativos.
INSTRUCCIÓN: Simula un entorno empresarial de alto nivel. Sé formal, cortés pero serio, estructurado y enfocado en negocios. Usa vocabulario corporativo o profesional avanzado aplicable a este escenario de ${targetLanguage.name}. Desafía al estudiante a expresarse formalmente. Haz preguntas profesionales rigurosas y corrígele los errores explicando la alternativa de etiqueta profesional más apropiada.`;
        break;
      case 'apresurado':
        systemInstruction += `

PERSONALIDAD: Transeúnte/Viajero con mucha prisa ("Viajero Apresurado").
INSTRUCCIÓN: No tienes tiempo para discursos largos o explicaciones pausadas. Imagina que te cruzas con el alumno en la estación del tren, en la calle o un café, y hablas de forma ágil, rápida, con oraciones súper cortas, dinámicas y directas. Sé amigable pero mantén la prisa en tu tono. Esto ayuda al usuario a desarrollar velocidad mental y comprensión rápida.`;
        break;
      case 'corrector':
        systemInstruction += `

PERSONALIDAD: Gramático Riguroso / Instructor Estricto de sintaxis.
INSTRUCCIÓN: Enfoca tu atención en analizar minuciosamente cada detalle de la frase del estudiante. Sé súper observador con los errores gramaticales, faltas ortográficas, preposiciones mal usadas o falta de concordancia. Antes de responder a la charla, señala los errores con bisturí de forma clara y didáctica, explicando con reglas gramaticales en español por qué se corrige de esa forma y cómo sonar más natural, para que aprendan a fondo.`;
        break;
      case 'regular':
      default:
        systemInstruction += `

PERSONALIDAD: Tutor Educativo Tradicional y Amable.
INSTRUCCIÓN: El tono debe ser académico, constructivo, muy positivo, motivador y sumamente claro. Explica conceptos nuevos cuando sea pertinente, felicita el progreso del estudiante por usar palabras correctas y mantén conversaciones estructuradas a ritmo moderado y legible para estudiantes principiantes a intermedios.`;
        break;
    }

    const chatHistoryPayload = history.map((h: any) => ({
      role: h.role,
      parts: [{ text: h.text }]
    }));

    const chat = getAi().chats.create({
      model: "gemini-3.5-flash",
      config: {
        systemInstruction,
      },
      history: chatHistoryPayload,
    });

    const result = await chat.sendMessage({ message: userInput });
    res.json({ text: result.text });
  } catch (error: any) {
    console.error("Server generateTutorResponse error:", error);
    res.status(500).json({ error: error.message || "Error generating tutor response" });
  }
});

app.post("/api/gemini/visual", async (req, res) => {
  const { prompt } = req.body;
  
  // Dynamic Unsplash Keyword Matching Helper for high-quality fallback imagery
  const getFallbackImageUrl = (promptText: string): string => {
    const p = (promptText || "").toLowerCase();
    
    if (p.includes("cafe") || p.includes("café") || p.includes("coffee") || p.includes("restaurant") || p.includes("break") || p.includes("food") || p.includes("drink") || p.includes("dish") || p.includes("eat") || p.includes("breakfast") || p.includes("lunch") || p.includes("dinner") || p.includes("bread") || p.includes("croissant") || p.includes("pastry")) {
      return "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=800&q=80"; // Cozy cafe
    }
    if (p.includes("travel") || p.includes("airport") || p.includes("trip") || p.includes("suitcase") || p.includes("baggage") || p.includes("luggage") || p.includes("ticket") || p.includes("passport") || p.includes("hotel") || p.includes("map") || p.includes("destination") || p.includes("visit") || p.includes("vacation") || p.includes("flight") || p.includes("plane")) {
      return "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=800&q=80"; // Travel map
    }
    if (p.includes("work") || p.includes("job") || p.includes("office") || p.includes("interview") || p.includes("meeting") || p.includes("business") || p.includes("money") || p.includes("company") || p.includes("corporate") || p.includes("career") || p.includes("boss") || p.includes("colleague")) {
      return "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80"; // Office building
    }
    if (p.includes("family") || p.includes("home") || p.includes("house") || p.includes("room") || p.includes("living") || p.includes("apartment") || p.includes("parent") || p.includes("child") || p.includes("kid") || p.includes("sister") || p.includes("brother")) {
      return "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=800&q=80"; // Cozy living room / home
    }
    if (p.includes("friend") || p.includes("chat") || p.includes("greeting") || p.includes("greetings") || p.includes("hello") || p.includes("meet") || p.includes("people") || p.includes("talk") || p.includes("speaking") || p.includes("speak") || p.includes("conversation")) {
      return "https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?auto=format&fit=crop&w=800&q=80"; // Talking friends
    }
    if (p.includes("animal") || p.includes("dog") || p.includes("cat") || p.includes("pet") || p.includes("nature") || p.includes("forest") || p.includes("outside") || p.includes("tree") || p.includes("mountain") || p.includes("sky") || p.includes("park") || p.includes("river") || p.includes("lake")) {
      return "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=800&q=80"; // Forest / Nature
    }
    if (p.includes("shop") || p.includes("store") || p.includes("clothes") || p.includes("buy") || p.includes("market") || p.includes("price") || p.includes("mall") || p.includes("purchase") || p.includes("shopping") || p.includes("grocery")) {
      return "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=800&q=80"; // Shopping
    }
    if (p.includes("city") || p.includes("street") || p.includes("road") || p.includes("direction") || p.includes("bus") || p.includes("train") || p.includes("car") || p.includes("metro") || p.includes("traffic") || p.includes("station") || p.includes("stop")) {
      return "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=800&q=80"; // City skyline
    }
    if (p.includes("art") || p.includes("drawing") || p.includes("paint") || p.includes("story") || p.includes("creative") || p.includes("design") || p.includes("music") || p.includes("instrument") || p.includes("book") || p.includes("read") || p.includes("write") || p.includes("tale") || p.includes("notebook")) {
      return "https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=800&q=80"; // Creative art
    }

    // Default beautiful language/academy learning image
    return "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=800&q=80";
  };

  try {
    const response = await getAi().models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: `A clean, minimalist educational illustration of: ${prompt}. White background, vibrant colors, simple shapes.` }],
      },
    });

    let b64: string | null = null;
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        b64 = `data:image/png;base64,${part.inlineData.data}`;
        break;
      }
    }
    if (b64) {
      res.json({ imageUrl: b64 });
    } else {
      throw new Error("No inlineData in model response parts");
    }
  } catch (error: any) {
    console.warn("Server generateVisualForWord error, falling back to cached Unsplash asset mappings gracefully:", error?.message || error);
    // Bypasses 500 error and serves premium visual representation instead!
    res.json({ imageUrl: getFallbackImageUrl(prompt) });
  }
});

app.post("/api/gemini/audio", async (req, res) => {
  const { text, voiceName } = req.body;
  try {
    const name = voiceName || 'Zephyr';
    const response = await getAi().models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: name },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    let url: string | null = null;
    if (base64Audio) {
      url = `data:audio/wav;base64,${base64Audio}`;
    }
    res.json({ audioUrl: url });
  } catch (error: any) {
    console.error("Server generateAudio error:", error);
    res.status(500).json({ error: error.message || "Error generating audio" });
  }
});

app.post("/api/gemini/story", async (req, res) => {
  const { targetLanguage } = req.body;
  try {
    const response = await getAi().models.generateContent({
      model: "gemini-3.5-flash",
      contents: `Inventa una historia corta y fascinante en ${targetLanguage.name} para un estudiante de idiomas. 
      La historia debe ser inmersiva y usar vocabulario útil.
      
      Incluye:
      1. Un título creativo.
      2. La historia completa en ${targetLanguage.name}.
      3. La traducción completa de la historia al español.
      4. Un conjunto de diálogos entre personajes que aparecen en la historia.
      5. Un prompt para generar una ilustración visual de la escena principal.
      6. 3 preguntas de comprensión sobre la historia en español, cada una con 4 opciones.

      Devuelve un JSON con el siguiente esquema:
      {
        "title": "string",
        "story": "string",
        "translation": "string",
        "imagePrompt": "string",
        "dialogues": [
          { "character": "string", "text": "string", "translation": "string" }
        ],
        "questions": [
          { "question": "string", "options": ["string", "string", "string", "string"], "correctAnswer": "string" }
        ]
      }`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            story: { type: Type.STRING },
            translation: { type: Type.STRING },
            imagePrompt: { type: Type.STRING },
            dialogues: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  character: { type: Type.STRING },
                  text: { type: Type.STRING },
                  translation: { type: Type.STRING }
                },
                required: ["character", "text", "translation"]
              }
            },
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  correctAnswer: { type: Type.STRING }
                },
                required: ["question", "options", "correctAnswer"]
              }
            }
          },
          required: ["title", "story", "translation", "imagePrompt", "dialogues", "questions"]
        }
      }
    });

    res.json({ text: response.text });
  } catch (error: any) {
    console.error("Server generateStory error:", error);
    res.status(500).json({ error: error.message || "Error generating story" });
  }
});

// Configure Vite middleware or serve static files
async function setupVite() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server fully started on http://localhost:${PORT}`);
  });
}

setupVite();
