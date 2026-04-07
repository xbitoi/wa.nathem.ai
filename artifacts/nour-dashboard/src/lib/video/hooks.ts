import { useEffect, useState } from 'react';

export function useVideoPlayer({ durations }: { durations: Record<string, number> }) {
  const [currentScene, setCurrentScene] = useState(0);
  const durationValues = Object.values(durations);

  useEffect(() => {
    // @ts-ignore
    window.startRecording?.();

    let timeout: ReturnType<typeof setTimeout>;
    
    const playScene = (index: number) => {
      setCurrentScene(index);
      
      const isLastScene = index === durationValues.length - 1;
      const nextIndex = isLastScene ? 0 : index + 1;
      
      timeout = setTimeout(() => {
        if (isLastScene) {
          // @ts-ignore
          window.stopRecording?.();
        }
        playScene(nextIndex);
      }, durationValues[index]);
    };

    playScene(0);

    return () => clearTimeout(timeout);
  }, [JSON.stringify(durations)]);

  return { currentScene };
}
