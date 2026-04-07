import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2000),
      setTimeout(() => setPhase(4), 3500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center z-10"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="relative">
        {/* Glow behind logo */}
        <motion.div 
          className="absolute inset-0 bg-blue-500/30 blur-[60px] rounded-full"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={phase >= 1 ? { opacity: 1, scale: 1.5 } : { opacity: 0, scale: 0.5 }}
          transition={{ duration: 1.5, ease: "easeOut" }}
        />
        
        {/* Logo Text */}
        <motion.h1 
          className="text-[12vw] font-black text-white tracking-tight leading-none drop-shadow-2xl"
          initial={{ opacity: 0, y: 50, rotateX: 45 }}
          animate={phase >= 1 ? { opacity: 1, y: 0, rotateX: 0 } : { opacity: 0, y: 50, rotateX: 45 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
        >
          ناظم
        </motion.h1>
      </div>

      <motion.div 
        className="mt-8 flex flex-col items-center"
        initial={{ opacity: 0, y: 20 }}
        animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ duration: 0.8 }}
      >
        <div className="h-[2px] bg-gradient-to-r from-transparent via-blue-400 to-transparent w-[30vw] mb-6" />
        <p className="text-[2vw] text-blue-200 tracking-widest font-medium uppercase">
          Yazaki Factory AI Agent
        </p>
      </motion.div>
    </motion.div>
  );
}
