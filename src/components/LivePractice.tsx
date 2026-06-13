/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  Loader2,
  Volume2,
  Gamepad2,
  MessageSquare
} from 'lucide-react';
import { Language } from '../types';
import { ai } from '../services/geminiService';
import { Modality, LiveServerMessage } from '@google/genai';

interface LivePracticeProps {
  language: Language;
  onClose: () => void;
}

export default function LivePractice({ language, onClose }: LivePracticeProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isModelSpeaking, setIsModelSpeaking] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [userTranscription, setUserTranscription] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioOutContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);

  // Buffer for audio playback
  const nextStartTimeRef = useRef(0);

  useEffect(() => {
    initSession();
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = () => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (audioOutContextRef.current) {
      audioOutContextRef.current.close();
      audioOutContextRef.current = null;
    }
  };

  const initSession = async () => {
    try {
      // 1. Get permissions
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { width: 640, height: 480 }
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      // 2. Connect to Gemini Live
      const sessionPromise = ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        callbacks: {
          onopen: () => {
            console.log("Live API connected");
            setIsConnected(true);
            setIsConnecting(false);
            startAudioStreaming();
            startVideoStreaming();
          },
          onmessage: async (message: LiveServerMessage) => {
            handleServerMessage(message);
          },
          onclose: () => {
            console.log("Live API closed");
            setIsConnected(false);
          },
          onerror: (err) => {
            console.error("Live API error", err);
            setIsConnecting(false);
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: `Eres un tutor de idiomas nativo en ${language.name}. 
          Estás en una videollamada con un estudiante. Tu objetivo es ayudarle a practicar conversación natural en tiempo real.
          - Sé amable y paciente.
          - Si el usuario comete un error, corrígelo suavemente.
          - Puedes comentar sobre lo que ves si el usuario te muestra algo en la cámara.
          - Mantén las respuestas relativamente cortas para que la conversación fluya.
          - Habla mayormente en ${language.name}, pero puedes usar español para aclarar conceptos difíciles.`,
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        },
      });

      sessionRef.current = await sessionPromise;

    } catch (error: any) {
      console.error("Failed to init live session", error);
      setIsConnecting(false);
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        alert("Permiso denegado para acceder a la cámara o el micrófono. Por favor, asegúrate de dar los permisos necesarios en tu navegador.");
      } else {
        alert("Error al iniciar la sesión en vivo: " + (error.message || "Error desconocido"));
      }
      onClose();
    }
  };

  const startAudioStreaming = async () => {
    if (!mediaStreamRef.current || !sessionRef.current) return;

    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 16000
    });

    const source = audioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
    const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);

    source.connect(processor);
    processor.connect(audioContextRef.current.destination);

    processor.onaudioprocess = (e) => {
      if (!isMicOn) return;
      const inputData = e.inputBuffer.getChannelData(0);
      
      // Convert Float32 to Int16
      const pcm16 = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        pcm16[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
      }
      
      // Convert to Base64
      const base64Data = btoa(
        String.fromCharCode.apply(null, new Uint8Array(pcm16.buffer) as any)
      );

      sessionRef.current.sendRealtimeInput({
        audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
      });
    };
  };

  const startVideoStreaming = () => {
    const streamInterval = setInterval(() => {
      if (!isVideoOn || !sessionRef.current || !isConnected) return;
      if (!videoRef.current || !canvasRef.current) return;

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const base64Data = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];

      sessionRef.current.sendRealtimeInput({
        video: { data: base64Data, mimeType: 'image/jpeg' }
      });
    }, 1000); // 1 frame per second for video context

    return () => clearInterval(streamInterval);
  };

  const handleServerMessage = (message: LiveServerMessage) => {
    // 1. Handle Audio
    const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      playPcmAudio(base64Audio);
    }

    // 2. Handle Interruption
    if (message.serverContent?.interrupted) {
      stopAudioPlayback();
    }

    // 3. Handle Transcriptions
    if (message.serverContent?.modelTurn?.parts?.[0]?.text) {
      setTranscription(prev => prev + message.serverContent?.modelTurn?.parts?.[0]?.text);
      setIsModelSpeaking(true);
    }
    
    // Check for end of turn
    if (message.serverContent?.turnComplete) {
      setIsModelSpeaking(false);
    }
  };

  const playPcmAudio = (base64Data: string) => {
    if (!audioOutContextRef.current) {
      audioOutContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000 // Gemini output is usually 24kHz
      });
      nextStartTimeRef.current = audioOutContextRef.current.currentTime;
    }

    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    
    const pcm16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 0x7FFF;

    const buffer = audioOutContextRef.current.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);

    const source = audioOutContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioOutContextRef.current.destination);
    
    const startTime = Math.max(nextStartTimeRef.current, audioOutContextRef.current.currentTime);
    source.start(startTime);
    nextStartTimeRef.current = startTime + buffer.duration;
  };

  const stopAudioPlayback = () => {
    if (audioOutContextRef.current) {
      audioOutContextRef.current.close().then(() => {
        audioOutContextRef.current = null;
      });
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-charcoal flex flex-col items-center justify-center overflow-hidden">
      <div className="absolute top-8 left-8 right-8 flex items-center justify-between z-10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-brand-primary rounded-2xl flex items-center justify-center text-white shadow-lg">
            <Volume2 />
          </div>
          <div>
            <h2 className="text-xl font-black font-serif text-white uppercase tracking-wider">Sesión en Vivo</h2>
            <p className="text-white/60 text-xs font-bold uppercase tracking-widest">Practicando {language.name}</p>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="p-4 bg-white/10 hover:bg-white/20 text-white rounded-2xl transition-all"
        >
          <X size={24} />
        </button>
      </div>

      <div className="w-full max-w-5xl aspect-video relative rounded-[40px] overflow-hidden border border-white/10 shadow-2xl bg-black">
        {/* User Camera */}
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          className={`w-full h-full object-cover transition-opacity duration-1000 ${isVideoOn ? 'opacity-100' : 'opacity-0'}`} 
        />
        <canvas ref={canvasRef} width="640" height="480" className="hidden" />

        {!isVideoOn && (
          <div className="absolute inset-0 flex items-center justify-center bg-brand-primary/5">
            <div className="w-32 h-32 rounded-full bg-brand-primary/20 flex items-center justify-center text-brand-primary animate-pulse">
              <VideoOff size={64} />
            </div>
          </div>
        )}

        {/* AI Overlay / Avatar */}
        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
          <div className="relative">
            <AnimatePresence>
              {isModelSpeaking && (
                <motion.div 
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  className="absolute inset-0 bg-brand-secondary/40 blur-3xl rounded-full"
                />
              )}
            </AnimatePresence>
            <div className="w-48 h-48 rounded-[60px] bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center relative z-10 shadow-2xl">
              <div className="flex items-center gap-2">
                {[1, 2, 3].map((i) => (
                  <motion.div
                    key={i}
                    animate={{
                      height: isModelSpeaking ? [20, 40, 20] : 10,
                      opacity: isModelSpeaking ? 1 : 0.4
                    }}
                    transition={{
                      repeat: Infinity,
                      duration: 0.6,
                      delay: i * 0.1
                    }}
                    className="w-2 bg-brand-secondary rounded-full"
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Captions */}
        <div className="absolute bottom-24 left-8 right-8 text-center pointer-events-none">
          <AnimatePresence mode="wait">
            {isModelSpeaking && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="inline-block px-8 py-4 bg-black/60 backdrop-blur-lg rounded-2xl border border-white/10 text-white font-medium text-lg max-w-2xl"
              >
                {transcription || "Escuchando..."}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Controls */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-white/10 backdrop-blur-xl p-4 rounded-[32px] border border-white/10 pointer-events-auto">
          <button 
            onClick={() => setIsMicOn(!isMicOn)}
            className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${isMicOn ? 'bg-white text-charcoal' : 'bg-red-500 text-white'}`}
          >
            {isMicOn ? <Mic size={24} /> : <MicOff size={24} />}
          </button>
          <button 
            onClick={() => setIsVideoOn(!isVideoOn)}
            className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${isVideoOn ? 'bg-white text-charcoal' : 'bg-red-500 text-white'}`}
          >
            {isVideoOn ? <Video size={24} /> : <VideoOff size={24} />}
          </button>
          <div className="w-px h-8 bg-white/20 mx-2" />
          <div className="px-6 py-3 bg-brand-primary text-white font-black rounded-xl text-sm uppercase tracking-widest flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-yellow-400'} animate-pulse`} />
            {isConnected ? 'En Línea' : 'Conectando'}
          </div>
        </div>
      </div>

      <div className="mt-12 text-center max-w-xl px-4">
        <p className="text-white/40 text-sm font-medium">
          Habla con fluidez, la IA te escucha y te ve en tiempo real. 
          Puedes mostrar objetos o simplemente conversar sobre cualquier tema.
        </p>
      </div>

      {isConnecting && (
        <div className="absolute inset-0 bg-charcoal/80 backdrop-blur-xl flex flex-col items-center justify-center gap-6 z-50">
          <div className="relative">
            <Loader2 className="w-16 h-16 text-brand-primary animate-spin" />
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: [0.8, 1.2, 0.8], opacity: [0, 0.3, 0] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="absolute inset-0 bg-brand-primary blur-2xl rounded-full"
            />
          </div>
          <div className="text-center">
            <h3 className="text-2xl font-black font-serif text-white">Preparando Sala</h3>
            <p className="text-white/50 text-sm">Configurando conexión neuronal en tiempo real...</p>
          </div>
        </div>
      )}
    </div>
  );
}
