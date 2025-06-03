// components/AudioPlayer.tsx
"use client"; // Needs to be a client component for useEffect, useRef
import React, { useEffect, useRef } from 'react';

// Your components/AudioPlayer.tsx (as you pasted)
interface AudioPlayerProps {
  audioSrc: string | null;
  onTimeUpdate?: (currentTime: number) => void; // It's correctly defined here as optional
  className?: string;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({ audioSrc, className }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (audioRef.current && audioSrc) {
      audioRef.current.src = audioSrc;
    } else if (audioRef.current && !audioSrc) {
      audioRef.current.removeAttribute('src');
      if (audioRef.current.load) audioRef.current.load(); // Ensure changes are picked up
    }
  }, [audioSrc]);

  if (!audioSrc) {
    return (
      <div className={`p-4 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-500 dark:text-gray-400 text-center ${className}`}>
        No audio source provided.
      </div>
    );
  }

  return (
    <audio
      ref={audioRef}
      controls
      className={`w-full rounded-lg ${className}`}
      key={audioSrc} // Add key to force re-render if src changes, helps with some browsers
    >
      Your browser does not support the audio element.
    </audio>
  );
};

export default AudioPlayer;