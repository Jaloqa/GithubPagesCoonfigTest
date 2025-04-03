import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './HomePage.module.css';
import gameApi from '@/shared/api/socketApi';

export const HomePage = () => {
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleCreateRoom = async () => {
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const result = await gameApi.createRoom(name);
      if (result && result.roomCode) {
        localStorage.setItem('roomCode', result.roomCode);
        navigate(`/game?name=${encodeURIComponent(name)}&room=${encodeURIComponent(result.roomCode)}&host=true`);
      } else {
        setError('Failed to create room');
      }
    } catch (error) {
      setError(error.message || 'An error occurred while creating the room');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinRoom = async () => {
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

    try {
      const result = await gameApi.joinRoom(roomCode, name);
      if (result && result.success) {
        localStorage.setItem('roomCode', roomCode);
        navigate(`/game?name=${encodeURIComponent(name)}&room=${encodeURIComponent(roomCode)}`);
      } else {
        setError(result?.error || 'Failed to join room');
      }
    } catch (error) {
      setError(error.message || 'An error occurred while joining the room');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Who Am I?</h1>
      <p className={styles.subtitle}>A fun party game to play with friends</p>
      
      <div className={styles.form}>
        <input
          type="text"
          className={styles.input}
          placeholder="Enter your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isLoading}
        />
        <input
          type="text"
          className={styles.input}
          placeholder="Room code (to join)"
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
          disabled={isLoading}
        />
        
        <div className={styles.buttons}>
          <button 
            className={`${styles.button} ${styles.createButton}`}
            onClick={handleCreateRoom}
            disabled={isLoading}
          >
            Create Room
          </button>
          <button 
            className={`${styles.button} ${styles.joinButton}`}
            onClick={handleJoinRoom}
            disabled={isLoading}
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
