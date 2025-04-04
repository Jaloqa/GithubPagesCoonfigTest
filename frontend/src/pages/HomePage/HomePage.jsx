import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './HomePage.module.css';
import gameApi from '@/shared/api/socketApi';

export const HomePage = () => {
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    gameApi.connect();
    gameApi.on('connect', () => setIsConnected(true));
    gameApi.on('disconnect', () => setIsConnected(false));
    gameApi.on('room-created', handleRoomCreated);
    gameApi.on('room-joined', handleRoomJoined);
    gameApi.on('error', handleError);

    return () => {
      gameApi.off('connect', () => setIsConnected(true));
      gameApi.off('disconnect', () => setIsConnected(false));
      gameApi.off('room-created', handleRoomCreated);
      gameApi.off('room-joined', handleRoomJoined);
      gameApi.off('error', handleError);
    };
  }, []);

  const handleRoomCreated = (data) => {
    if (data && data.roomCode) {
      localStorage.setItem('roomCode', data.roomCode);
      navigate(`/game?name=${encodeURIComponent(name)}&room=${encodeURIComponent(data.roomCode)}&host=true`);
    } else {
      setError('Failed to create room');
    }
    setIsLoading(false);
  };

  const handleRoomJoined = (data) => {
    if (data && data.success) {
      localStorage.setItem('roomCode', roomCode);
      navigate(`/game?name=${encodeURIComponent(name)}&room=${encodeURIComponent(roomCode)}`);
    } else {
      setError(data?.error || 'Failed to join room');
    }
    setIsLoading(false);
  };

  const handleError = (error) => {
    setError(error.message || 'An error occurred');
    setIsLoading(false);
  };

  const handleCreateRoom = () => {
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }

    setIsLoading(true);
    setError('');
    gameApi.createRoom(name);
  };

  const handleJoinRoom = () => {
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }

    if (!roomCode.trim()) {
      setError('Please enter room code');
      return;
    }

    setIsLoading(true);
    setError('');
    gameApi.joinRoom(roomCode, name);
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Who Am I?</h1>
      <p className={styles.subtitle}>A fun party game to play with friends</p>
      
      {!isConnected && (
        <div className={styles.connectionStatus}>
          Connecting to server...
        </div>
      )}
      
      <div className={styles.form}>
        <input
          type="text"
          className={styles.input}
          placeholder="Enter your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isLoading || !isConnected}
        />
        <input
          type="text"
          className={styles.input}
          placeholder="Room code (to join)"
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
          disabled={isLoading || !isConnected}
        />
        
        <div className={styles.buttons}>
          <button 
            className={`${styles.button} ${styles.createButton}`}
            onClick={handleCreateRoom}
            disabled={isLoading || !isConnected}
          >
            Create Room
          </button>
          <button 
            className={`${styles.button} ${styles.joinButton}`}
            onClick={handleJoinRoom}
            disabled={isLoading || !isConnected}
          >
            Join Room
          </button>
        </div>

        {error && <p className={styles.error}>{error}</p>}
        {isLoading && <p className={styles.loading}>Loading...</p>}
      </div>
    </div>
  );
};
