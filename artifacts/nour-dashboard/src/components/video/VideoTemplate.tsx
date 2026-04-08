import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video/hooks';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';

const SCENE_DURATIONS = { open: 4000, problem: 4000, solution: 4000, magic: 4500, close: 5000 };
const TOTAL_MS = Object.values(SCENE_DURATIONS).reduce((a, b) => a + b, 0); // 21500ms

type RecordState = 'idle' | 'waiting' | 'recording' | 'done';

export default function VideoTemplate() {
  const { currentScene, restart } = useVideoPlayer({ durations: SCENE_DURATIONS });

  const [recordState, setRecordState] = useState<RecordState>('idle');
  const [progress, setProgress] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    try {
      setRecordState('waiting');
      setCountdown(3);

      // Ask user to share the current tab
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 } as any,
        audio: false,
      });

      // 3-second countdown before recording
      for (let i = 3; i >= 1; i--) {
        setCountdown(i);
        await new Promise(r => setTimeout(r, 1000));
      }

      // Restart video from scene 1
      restart();

      // Start MediaRecorder
      chunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'nazim-video.webm';
        a.click();
        URL.revokeObjectURL(url);
        setRecordState('done');
        setProgress(0);
        setTimeout(() => setRecordState('idle'), 3000);
      };

      recorder.start(100);
      setRecordState('recording');

      // Progress tracking
      const startTime = Date.now();
      const tick = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const pct = Math.min((elapsed / TOTAL_MS) * 100, 100);
        setProgress(pct);
        if (elapsed >= TOTAL_MS) {
          clearInterval(tick);
          recorder.stop();
        }
      }, 100);
    } catch (err: any) {
      // User cancelled or error
      setRecordState('idle');
      setProgress(0);
    }
  }, [restart]);

  const stopEarly = useCallback(() => {
    recorderRef.current?.stop();
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black font-sans flex items-center justify-center">
      {/* Background Video Layer */}
      <div className="absolute inset-0 opacity-40">
        <video
          src={`${import.meta.env.BASE_URL}videos/factory-bg.mp4`}
          className="w-full h-full object-cover"
          autoPlay loop muted playsInline
        />
      </div>

      {/* Cinematic Overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#003366]/20 to-transparent mix-blend-overlay" />

      {/* Persistent Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full opacity-20 blur-[100px]"
          style={{ background: 'radial-gradient(circle, #0ea5e9, transparent)' }}
          animate={{ x: ['0%', '20%', '-10%', '0%'], y: ['0%', '10%', '-20%', '0%'], scale: [1, 1.2, 0.8, 1] }}
          transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
        />
        <motion.div
          className="absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] rounded-full opacity-10 blur-[120px]"
          style={{ background: 'radial-gradient(circle, #f59e0b, transparent)' }}
          animate={{ x: ['0%', '-20%', '10%', '0%'], y: ['0%', '-10%', '20%', '0%'], scale: [1, 0.9, 1.1, 1] }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
        />
      </div>

      {/* Scene Content */}
      <AnimatePresence mode="popLayout">
        {currentScene === 0 && <Scene1 key="open" />}
        {currentScene === 1 && <Scene2 key="problem" />}
        {currentScene === 2 && <Scene3 key="solution" />}
        {currentScene === 3 && <Scene4 key="magic" />}
        {currentScene === 4 && <Scene5 key="close" />}
      </AnimatePresence>

      {/* ── Recording Controls ── */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-3">

        {/* Waiting / Countdown */}
        {recordState === 'waiting' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-2"
          >
            <div className="text-white/80 text-sm">اختر علامة التبويب هذه في نافذة المشاركة...</div>
            <div className="text-6xl font-bold text-white">{countdown}</div>
          </motion.div>
        )}

        {/* Recording progress bar */}
        {recordState === 'recording' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-2 w-64"
          >
            <div className="flex items-center gap-2 text-white text-sm">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              جارٍ التسجيل...
              <span className="text-white/60">{Math.round((progress / 100) * (TOTAL_MS / 1000))}s / {TOTAL_MS / 1000}s</span>
            </div>
            <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-red-500 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
            <button
              onClick={stopEarly}
              className="text-xs text-white/50 hover:text-white/80 transition-colors"
            >
              إيقاف مبكر
            </button>
          </motion.div>
        )}

        {/* Done */}
        {recordState === 'done' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-green-400 text-sm font-medium"
          >
            ✅ تم تحميل الفيديو!
          </motion.div>
        )}

        {/* Record button — shown when idle */}
        {recordState === 'idle' && (
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
            onClick={startRecording}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-white shadow-lg transition-all"
            style={{ background: 'rgba(239,68,68,0.85)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)' }}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
            سجّل وحمّل الفيديو
          </motion.button>
        )}
      </div>
    </div>
  );
}
