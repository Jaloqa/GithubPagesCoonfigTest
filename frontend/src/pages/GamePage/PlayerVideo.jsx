import React, { useEffect, useRef, useState } from 'react';
import { FaMicrophone, FaMicrophoneSlash, FaVideo, FaVideoSlash } from 'react-icons/fa';
import './PlayerVideo.css';

const PlayerVideo = ({ stream, isCurrentPlayer, playerName, character, isAudioEnabled = true }) => {
  const videoRef = useRef(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 3;

  useEffect(() => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    let mounted = true;
    let retryTimeout;

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
      
      // Пробуем переподключиться
      if (retryCount < maxRetries) {
        retryTimeout = setTimeout(() => {
          setRetryCount(prev => prev + 1);
          setStatus('loading');
          if (stream) {
            try {
              video.srcObject = stream;
            } catch (err) {
              console.error('Retry failed:', err);
            }
          }
        }, 2000);
      }
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

    const handleStalled = () => {
      if (!mounted) return;
      console.log('Video stalled, trying to recover...');
      if (video.paused) {
        video.play().catch(err => console.error('Failed to resume playback:', err));
      }
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('error', handleError);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('stalled', handleStalled);

    if (stream) {
      try {
        video.srcObject = stream;
        console.log('Stream assigned to video element:', {
          videoTracks: stream.getVideoTracks().length,
          audioTracks: stream.getAudioTracks().length
        });

        // Принудительно запускаем воспроизведение
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise.catch(err => {
            console.error('Auto-play failed:', err);
            setStatus('waiting-interaction');
          });
        }
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
      clearTimeout(retryTimeout);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('error', handleError);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('stalled', handleStalled);
      video.srcObject = null;
    };
  }, [stream, retryCount]);

  const handleClick = () => {
    if (videoRef.current && (status === 'waiting-interaction' || status === 'paused')) {
      videoRef.current.play()
        .then(() => {
          console.log('Video started after click');
          setStatus('playing');
        })
        .catch(err => {
          console.error('Failed to start video after click:', err);
          setStatus('error');
          setError('Не удалось запустить видео');
        });
    }
  };

  const renderStatus = () => {
    switch (status) {
      case 'loading':
        return <div className="video-loading">Загрузка...</div>;
      case 'error':
        return (
          <div className="video-error">
            <FaVideoSlash size={24} />
            <span>{error || 'Ошибка видео'}</span>
            {retryCount < maxRetries && <span>Попытка {retryCount + 1}/{maxRetries}</span>}
          </div>
        );
      case 'no-stream':
        return (
          <div className="video-offline">
            <FaVideoSlash size={24} />
            <span>Видео недоступно</span>
          </div>
        );
      case 'waiting-interaction':
      case 'paused':
        return (
          <div className="video-waiting" onClick={handleClick}>
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
      <div className="video-wrapper" onClick={handleClick}>
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