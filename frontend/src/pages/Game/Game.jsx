import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import styles from './Game.module.css';
import gameApi from '@/shared/api/socketApi';

export const Game = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [roomState, setRoomState] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const name = searchParams.get('name');
  const roomCode = searchParams.get('room');
  const isHost = searchParams.get('host') === 'true';

  useEffect(() => {
    if (!name || !roomCode) {
      navigate('/');
      return;
    }

    gameApi.connect();
    gameApi.on('connect', () => setIsConnected(true));
    gameApi.on('disconnect', () => setIsConnected(false));
    gameApi.on('room-state', handleRoomState);
    gameApi.on('error', handleError);
    gameApi.on('game-started', handleGameStarted);
    gameApi.on('player-joined', handlePlayerJoined);
    gameApi.on('player-left', handlePlayerLeft);
    gameApi.on('character-set', handleCharacterSet);

    gameApi.startPolling(roomCode, (state) => {
      setRoomState(state);
      setIsLoading(false);
    });

    return () => {
      gameApi.stopPolling();
      gameApi.off('connect', () => setIsConnected(true));
      gameApi.off('disconnect', () => setIsConnected(false));
      gameApi.off('room-state', handleRoomState);
      gameApi.off('error', handleError);
      gameApi.off('game-started', handleGameStarted);
      gameApi.off('player-joined', handlePlayerJoined);
      gameApi.off('player-left', handlePlayerLeft);
      gameApi.off('character-set', handleCharacterSet);
    };
  }, [name, roomCode, navigate]);

  const handleRoomState = (state) => {
    setRoomState(state);
    setIsLoading(false);
  };

  const handleError = (error) => {
    setError(error.message || 'An error occurred');
    setIsLoading(false);
  };

  const handleGameStarted = () => {
    setError('');
  };

  const handlePlayerJoined = (data) => {
    setError('');
  };

  const handlePlayerLeft = (data) => {
    setError('');
  };

  const handleCharacterSet = (data) => {
    setError('');
  };

  const handleStartGame = () => {
    if (!isHost) return;
    setIsLoading(true);
    gameApi.startGame(roomCode);
  };

  const handleLeaveRoom = () => {
    gameApi.leaveRoom(roomCode);
    navigate('/');
  };

  const handleSetCharacter = (targetPlayerId, character) => {
    gameApi.setCharacter(roomCode, targetPlayerId, character);
  };

  useEffect(() => {
    const setupVideo = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error('Error accessing media devices:', error);
      }
    };

    setupVideo();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading...</div>
      </div>
    );
  }

  if (!roomState) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>Room not found</div>
        <button className={styles.button} onClick={handleLeaveRoom}>
          Leave Room
        </button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.roomInfo}>
          <div className={styles.roomCode}>Room: {roomCode}</div>
          <div className={styles.playerName}>You: {name}</div>
        </div>
        <div className={styles.controls}>
          {isHost && (
            <button
              className={`${styles.button} ${styles.startButton}`}
              onClick={handleStartGame}
              disabled={!isConnected || roomState.gameStarted}
            >
              Start Game
            </button>
          )}
          <button
            className={`${styles.button} ${styles.leaveButton}`}
            onClick={handleLeaveRoom}
            disabled={!isConnected}
          >
            Leave Room
          </button>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.playersGrid}>
        {roomState.players.map((player) => (
          <div key={player.id} className={styles.playerCard}>
            <div className={styles.playerName}>{player.name}</div>
            <div className={styles.playerStatus}>
              <div className={`${styles.statusIndicator} ${player.online ? '' : styles.offline}`} />
              <span>{player.online ? 'Online' : 'Offline'}</span>
            </div>
            <div className={styles.videoContainer}>
              <video
                ref={player.id === name ? videoRef : null}
                className={styles.video}
                autoPlay
                playsInline
                muted={player.id === name}
              />
            </div>
            {roomState.gameStarted && player.character && (
              <div className={styles.character}>
                Character: {player.character}
              </div>
            )}
            {isHost && !roomState.gameStarted && !player.character && (
              <button
                className={styles.button}
                onClick={() => handleSetCharacter(player.id, 'Character Name')}
              >
                Set Character
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}; 