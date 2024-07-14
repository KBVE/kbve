/** @jsxImportSource react */
import React, { useState, useRef } from 'react';

const MusicJukebox: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const playMusic = () => {
    if (audioRef.current) {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const pauseMusic = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const stopMusic = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  };

  return (
    <div>
      <h1>Music Jukebox</h1>
      <audio ref={audioRef} src="your-audio-file.mp3" />
      <div>
        <button onClick={playMusic} disabled={isPlaying}>Play</button>
        <button onClick={pauseMusic} disabled={!isPlaying}>Pause</button>
        <button onClick={stopMusic}>Stop</button>
      </div>
    </div>
  );
};

export default MusicJukebox;
