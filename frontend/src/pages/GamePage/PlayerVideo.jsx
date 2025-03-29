import React, { useEffect, useRef, useState } from 'react';
import styles from './GamePage.module.css';
import videoApi from '../../shared/api/videoApi';

const PlayerVideo = ({ 
  stream, 
  playerId, 
  playerName, 
  character, 
  isCurrentPlayer, 
  isVideoEnabled = true, 
  isAudioEnabled = true, 
  muted 
}) => {
  const videoRef = useRef(null);
  const [hasVideo, setHasVideo] = useState(false);
  const [videoError, setVideoError] = useState(null);
  const [videoStatus, setVideoStatus] = useState('connecting'); // 'connecting', 'active', 'error'

  useEffect(() => {
    console.log('PlayerVideo: Обновление потока для', playerId, stream ? `Видеотреков: ${stream.getVideoTracks().length}, Аудиотреков: ${stream.getAudioTracks().length}` : 'нет потока');
    
    if (!stream || !videoRef.current) {
      console.log('Нет потока для игрока', playerId, 'или ссылки на видеоэлемент');
      return;
    }

    const videoElement = videoRef.current;
    const videoTrack = stream.getVideoTracks()[0];
    
    if (videoTrack) {
      console.log('Видеотрек для', playerId, ':', {
        enabled: videoTrack.enabled,
        active: videoTrack.active,
        type: videoTrack.kind,
        readyState: videoTrack.readyState,
        muted: videoTrack.muted
      });
    }

    // Очищаем предыдущий источник видео
    if (videoElement.srcObject) {
      console.log('Очищаем предыдущий источник видео для', playerId);
      videoElement.srcObject = null;
    }

    // Устанавливаем новый поток
    videoElement.srcObject = stream;
    
    // Настраиваем обработчики событий
    const handlePlay = () => {
      console.log('Видео успешно запущено для', playerId);
    };

    const handleError = (error) => {
      console.error('Ошибка воспроизведения видео:', error);
      // Пробуем перезапустить воспроизведение
      setTimeout(() => {
        if (videoElement.paused) {
          console.log('Пробуем перезапустить воспроизведение для', playerId);
          videoElement.play().catch(err => {
            console.error('Ошибка при перезапуске воспроизведения:', err);
          });
        }
      }, 1000);
    };

    const handleLoadedMetadata = () => {
      console.log('Метаданные видео загружены для', playerId);
      // Пробуем запустить воспроизведение
      videoElement.play().catch(err => {
        console.error('Ошибка при запуске воспроизведения:', err);
      });
    };

    videoElement.addEventListener('play', handlePlay);
    videoElement.addEventListener('error', handleError);
    videoElement.addEventListener('loadedmetadata', handleLoadedMetadata);

    // Очистка при размонтировании
    return () => {
      console.log('Очистка компонента PlayerVideo для', playerId);
      videoElement.removeEventListener('play', handlePlay);
      videoElement.removeEventListener('error', handleError);
      videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
      
      if (videoElement.srcObject) {
        videoElement.srcObject.getTracks().forEach(track => track.stop());
        videoElement.srcObject = null;
      }
    };
  }, [stream, playerId]);

  // Обработчик ошибок воспроизведения видео
  const handleVideoError = (error) => {
    console.error(`Ошибка воспроизведения видео для ${playerId}:`, error);
    setVideoError(error.message || 'Ошибка воспроизведения видео');
    setHasVideo(false);
    setVideoStatus('error');
  };

  // Обработчик успешной загрузки видео
  const handleVideoPlay = () => {
    console.log(`Видео успешно запущено для ${playerId}`);
    setVideoStatus('active');
    setHasVideo(true);
  };

  // Определяем, показывать ли видео
  const showVideo = stream && 
    (hasVideo || stream.getVideoTracks().length > 0 || stream.isCanvasStream);

  return (
    <div className={styles.playerVideoContainer}>
      {stream ? (
        <div className={styles.videoWrapper}>
          <video
            ref={videoRef}
            className={styles.playerVideo}
            autoPlay
            playsInline
            muted={muted}
            onError={handleVideoError}
            onPlay={handleVideoPlay}
          />
          <div className={`${styles.videoStatus} ${styles[`videoStatus${videoStatus.charAt(0).toUpperCase() + videoStatus.slice(1)}`]}`}>
            <span className={styles.streamIcon}>
              {videoStatus === 'connecting' && '⌛'}
              {videoStatus === 'active' && '✓'}
              {videoStatus === 'error' && '✗'}
            </span>
          </div>
        </div>
      ) : (
        <div className={styles.placeholderVideo}>
          <div className={styles.placeholderContent}>
            <span role="img" aria-label="user">👤</span>
            <div className={styles.noVideoText}>
              {videoError ? 'Ошибка видео' : 'Подключение...'}
            </div>
            <div className={styles.spinnerContainer}>
              <div className={styles.spinner}></div>
            </div>
          </div>
        </div>
      )}
      {!isVideoEnabled && stream && (
        <div className={styles.videoDisabled}>
          <span className={styles.noVideoIcon}>🎥</span>
        </div>
      )}
      <div className={styles.playerInfo}>
        <div className={styles.playerName}>
          {playerName || `Игрок ${playerId?.substring(0, 4) || 'неизвестный'}`} {isCurrentPlayer && ' (Вы)'}
        </div>
        {character && (
          <div className={styles.playerCharacter}>
            Персонаж: {isCurrentPlayer ? '???' : character}
          </div>
        )}
        {!isAudioEnabled && (
          <div className={styles.mediaControls}>
            <span className={styles.mutedIcon}>🔇</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlayerVideo; 