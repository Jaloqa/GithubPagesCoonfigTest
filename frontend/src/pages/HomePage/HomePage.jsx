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
      setError('Введите ваше имя');
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
        setError('Не удалось создать комнату');
      }
    } catch (error) {
      setError(error.message || 'Произошла ошибка при создании комнаты');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!name.trim()) {
      setError('Введите ваше имя');
      return;
    }

    if (!roomCode.trim()) {
      setError('Введите код комнаты');
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
        setError(result?.error || 'Не удалось присоединиться к комнате');
      }
    } catch (error) {
      setError(error.message || 'Произошла ошибка при присоединении к комнате');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <h1>Добро пожаловать в игру</h1>
      <div className={styles.form}>
        <input
          type="text"
          placeholder="Ваше имя"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isLoading}
        />
        <input
          type="text"
          placeholder="Код комнаты (для присоединения)"
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value)}
          disabled={isLoading}
        />
        <div className={styles.buttons}>
          <button 
            onClick={handleCreateRoom}
            disabled={isLoading}
          >
            Создать комнату
          </button>
          <button 
            onClick={handleJoinRoom}
            disabled={isLoading}
          >
            Присоединиться
          </button>
        </div>
        {error && <p className={styles.error}>{error}</p>}
        {isLoading && <p className={styles.loading}>Загрузка...</p>}
      </div>
    </div>
  );
};
