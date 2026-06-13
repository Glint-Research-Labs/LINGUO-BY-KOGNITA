import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RotateCcw, Check, X, Layers } from 'lucide-react';

interface Card {
  word: string;
  translation: string;
}

export default function Flashcards({ cards, onClose }: { cards: Card[], onClose: () => void }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  if (cards.length === 0) return (
    <div className="bg-white p-12 rounded-[40px] text-center space-y-6">
      <div className="w-20 h-20 bg-brand-accent rounded-full flex items-center justify-center mx-auto text-4xl">📚</div>
      <h3 className="text-2xl font-black font-serif">¡Aún no tienes tarjetas!</h3>
      <p className="text-slate-text">Completa lecciones para guardar palabras en tu mazo de repaso.</p>
      <button onClick={onClose} className="px-10 py-4 bg-brand-primary text-white rounded-full font-black">Volver</button>
    </div>
  );

  const currentCard = cards[currentIndex];

  return (
    <div className="max-w-md mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2 text-brand-primary font-black uppercase tracking-widest text-xs">
          <Layers size={16} />
          <span>{currentIndex + 1} / {cards.length} Tarjetas</span>
        </div>
        <button onClick={onClose} className="text-slate-text hover:text-charcoal"><X /></button>
      </div>

      <div className="h-[400px] perspective-1000">
        <motion.div
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          onClick={() => setIsFlipped(!isFlipped)}
          className="relative w-full h-full cursor-pointer preserve-3d"
        >
          {/* Front */}
          <div className="absolute w-full h-full bg-white rounded-[40px] p-10 shadow-2xl border-4 border-brand-primary/10 flex flex-col items-center justify-center text-center backface-hidden">
            <div className="text-xs font-black text-brand-primary uppercase tracking-[0.3em] mb-4">Palabra</div>
            <div className="text-5xl font-black font-serif text-charcoal">{currentCard.word}</div>
            <div className="mt-12 text-slate-text text-sm animate-pulse">Toca para dar la vuelta</div>
          </div>

          {/* Back */}
          <div className="absolute w-full h-full bg-brand-primary rounded-[40px] p-10 shadow-2xl flex flex-col items-center justify-center text-center backface-hidden rotate-y-180">
            <div className="text-xs font-black text-white/60 uppercase tracking-[0.3em] mb-4">Traducción</div>
            <div className="text-5xl font-black font-serif text-white">{currentCard.translation}</div>
            <Check className="mt-8 text-white/40" size={48} />
          </div>
        </motion.div>
      </div>

      <div className="flex gap-4 mt-8">
        <button 
          onClick={() => {
            setIsFlipped(false);
            setTimeout(() => setCurrentIndex((prev) => (prev + 1) % cards.length), 150);
          }}
          className="flex-1 py-5 bg-charcoal text-white rounded-[24px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all"
        >
          <RotateCcw size={18} /> Siguiente
        </button>
      </div>
    </div>
  );
}
