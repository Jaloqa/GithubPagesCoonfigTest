import React, { useEffect, useRef, useState } from 'react';
import { FaMicrophone, FaMicrophoneSlash, FaVideo, FaVideoSlash } from 'react-icons/fa';
import './PlayerVideo.css';

const PlayerVideo = ({ stream, isCurrentPlayer, playerName, character, isAudioEnabled = true }) => {
  const videoRef = useRef(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    let mounted = true;

    const handleLoadedMetadata = () => {
      if (!mounted) return;
      console.log('Video metadata loaded:', {
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration
      });
      setStatus('ready');
    };

    const handleError = (e) => {
      if (!mounted) return;
      console.error('Video error:', e);
      setError('Ошибка загрузки видео');
      setStatus('error');
    };

    const handlePlay = () => {
      if (!mounted) return;
      console.log('Video started playing');
      setStatus('playing');
    };

    const handlePause = () => {
      if (!mounted) return;
      console.log('Video paused');
      setStatus('paused');
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('error', handleError);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    if (stream) {
      try {
        video.srcObject = stream;
        console.log('Stream assigned to video element:', {
          videoTracks: stream.getVideoTracks().length,
          audioTracks: stream.getAudioTracks().length
        });
      } catch (err) {
        console.error('Error setting video stream:', err);
        setError('Ошибка установки потока видео');
        setStatus('error');
      }
    } else {
      setStatus('no-stream');
    }

    return () => {
      mounted = false;
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('error', handleError);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.srcObject = null;
    };
  }, [stream]);

  const renderStatus = () => {
    switch (status) {
      case 'loading':
        return <div className="video-loading">Загрузка...</div>;
      case 'error':
        return <div className="video-error">{error || 'Ошибка видео'}</div>;
      case 'no-stream':
        return (
          <div className="video-offline">
            <FaVideoSlash size={24} />
            <span>Видео недоступно</span>
          </div>
        );
      case 'paused':
        return (
          <div className="video-waiting" onClick={() => videoRef.current?.play()}>
            <FaVideo size={24} />
            <span>Нажмите для воспроизведения</span>
          </div>
        );
      default:
        return null;
    }
  };

  const getInitials = (name) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className={`player-video-container ${isCurrentPlayer ? 'current-player' : ''}`}>
      <div className="video-wrapper">
        {stream ? (
          <video
            ref={videoRef}
            className="player-video"
            autoPlay
            playsInline
            muted={isCurrentPlayer}
          />
        ) : (
          <div className="video-placeholder">
            <div className="avatar-placeholder">
              {getInitials(playerName)}
            </div>
          </div>
        )}
        {renderStatus()}
      </div>
      <div className="player-info">
        <div className="player-name">{playerName}</div>
        {character && <div className="player-character">{character}</div>}
        <div className="audio-status">
          {!isAudioEnabled && <FaMicrophoneSlash className="muted-icon" />}
        </div>
      </div>
    </div>
  );
};

export default PlayerVideo; 