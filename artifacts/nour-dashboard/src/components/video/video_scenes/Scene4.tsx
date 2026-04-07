import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 800),
      setTimeout(() => setPhase(3), 1600),
      setTimeout(() => setPhase(4), 2400),
      setTimeout(() => setPhase(5), 4000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center z-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, filter: 'blur(20px)', scale: 1.1 }}
      transition={{ duration: 1 }}
    >
      {/* Scanning effect background */}
      <motion.div 
        className="absolute inset-0 bg-blue-500/10 pointer-events-none mix-blend-screen"
        initial={{ opacity: 0, top: '-100%' }}
        animate={phase >= 1 ? { opacity: [0, 0.5, 0], top: ['-100%', '100%'] } : {}}
        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
      />
      <div className="absolute inset-0 border-y-2 border-blue-500/20" />

      <div className="flex flex-col items-center justify-center h-full max-w-[80vw]">
        <div className="flex gap-[4vw] mb-12 items-center">
          {['Reads', 'Understands', 'Responds'].map((word, i) => (
            <motion.div 
              key={word}
              className="px-[2vw] py-[1vw] rounded-full border border-blue-400/30 bg-blue-900/20 backdrop-blur-sm text-blue-200 text-[2.5vw] font-medium"
              initial={{ opacity: 0, scale: 0.5, y: 20 }}
              animate={phase >= i + 1 ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.5, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              {word}
            </motion.div>
          ))}
        </div>

        <motion.h2 
          className="text-[5vw] font-bold text-white text-center leading-tight mb-10"
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 4 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.8 }}
        >
          <span className="text-blue-400">Nazim</span> reads, understands, <br/> and responds.
        </motion.h2>

        <motion.div 
          className="bg-black/50 backdrop-blur-md border border-white/10 p-6 rounded-2xl"
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={phase >= 4 ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.9, y: 20 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          <p className="text-[2.5vw] text-blue-300 font-arabic" dir="rtl">
            ناظم يقرأ، يفهم، ويجيب
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
}
