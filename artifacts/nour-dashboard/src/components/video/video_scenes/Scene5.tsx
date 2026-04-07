import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 2500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/40 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.2 }}
      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="flex flex-col items-center justify-center relative">
        <motion.div 
          className="absolute inset-0 bg-blue-600/40 blur-[100px] rounded-full"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={phase >= 1 ? { opacity: 1, scale: 1.2 } : { opacity: 0, scale: 0.5 }}
          transition={{ duration: 2, ease: "easeOut" }}
        />

        <motion.h1 
          className="text-[10vw] font-black text-white tracking-tight leading-none drop-shadow-2xl mb-4 relative z-10"
          initial={{ opacity: 0, y: 50, scale: 0.8 }}
          animate={phase >= 1 ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 50, scale: 0.8 }}
          transition={{ type: "spring", stiffness: 150, damping: 20 }}
        >
          ناظم
        </motion.h1>

        <motion.h2 
          className="text-[3.5vw] font-medium text-gray-300 mb-10 relative z-10 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.8 }}
        >
          Your factory AI agent
        </motion.h2>

        <motion.div 
          className="bg-white/10 backdrop-blur-xl border border-white/20 px-8 py-4 rounded-full relative z-10 shadow-[0_0_30px_rgba(59,130,246,0.3)]"
          initial={{ opacity: 0, y: 20, scale: 0.9 }}
          animate={phase >= 3 ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 20, scale: 0.9 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <p className="text-[2.5vw] text-white font-arabic font-bold" dir="rtl">
            ناظم — وكيلك الذكي في المصنع
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
}
