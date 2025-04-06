import React, { useState, useEffect, useCallback } from 'react';
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

  // Используем useCallback для создания функций-обработчиков, чтобы они сохраняли референсы
  const handleRoomCreated = useCallback((data) => {
    console.log('Комната создана (в HomePage):', data);
    setIsLoading(false);
    
    if (data && data.roomCode) {
      // Сохраняем данные комнаты в localStorage
      localStorage.setItem('roomCode', data.roomCode);
      if (data.playerId) {
        localStorage.setItem('playerId', data.playerId);
      }
      
      // Переходим на страницу игры
      navigate(`/game?name=${encodeURIComponent(name)}&room=${encodeURIComponent(data.roomCode)}&host=true`);
    } else {
      setError('Не удалось создать комнату. Попробуйте еще раз.');
    }
  }, [navigate, name]);

  const handleRoomJoined = useCallback((data) => {
    console.log('Подключение к комнате (в HomePage):', data);
    setIsLoading(false);
    
    if (data && data.success) {
      // Сохраняем данные комнаты в localStorage
      localStorage.setItem('roomCode', roomCode);
      if (data.playerId) {
        localStorage.setItem('playerId', data.playerId);
      }
      
      // Переходим на страницу игры
      navigate(`/game?name=${encodeURIComponent(name)}&room=${encodeURIComponent(roomCode)}`);
    } else {
      setError(data?.error || 'Не удалось подключиться к комнате');
    }
  }, [navigate, name, roomCode]);

  const handleError = useCallback((error) => {
    console.error('Ошибка при создании/подключении к комнате:', error);
    setIsLoading(false);
    setError(error?.message || 'Произошла ошибка. Проверьте подключение к серверу.');
  }, []);

  const handleConnectChange = useCallback((isConnected) => {
    console.log('Изменение статуса подключения:', isConnected);
    setIsConnected(isConnected);
  }, []);

  // Устанавливаем обработчики событий при монтировании компонента
  useEffect(() => {
    console.log('Инициализация HomePage');
    
    // Подключаемся к серверу
    gameApi.connect();
    
    // Устанавливаем обработчики
    const handleConnect = () => handleConnectChange(true);
    const handleDisconnect = () => handleConnectChange(false);
    
    gameApi.on('connect', handleConnect);
    gameApi.on('disconnect', handleDisconnect);
    gameApi.on('room-created', handleRoomCreated);
    gameApi.on('room-joined', handleRoomJoined);
    gameApi.on('error', handleError);
    
    // Проверяем текущее состояние подключения
    setIsConnected(gameApi.isConnected());

    // Очищаем обработчики при размонтировании
    return () => {
      console.log('Очистка обработчиков HomePage');
      gameApi.off('connect', handleConnect);
      gameApi.off('disconnect', handleDisconnect);
      gameApi.off('room-created', handleRoomCreated);
      gameApi.off('room-joined', handleRoomJoined);
      gameApi.off('error', handleError);
    };
  }, [handleRoomCreated, handleRoomJoined, handleError, handleConnectChange]);

  const handleCreateRoom = () => {
    if (!name.trim()) {
      setError('Пожалуйста, введите ваше имя');
      return;
    }

    setIsLoading(true);
    setError('');
    console.log('Создание комнаты для игрока:', name);
    gameApi.createRoom(name);
  };

  const handleJoinRoom = () => {
    if (!name.trim()) {
      setError('Пожалуйста, введите ваше имя');
      return;
    }

    if (!roomCode.trim()) {
      setError('Пожалуйста, введите код комнаты');
      return;
    }

    setIsLoading(true);
    setError('');
    console.log('Присоединение к комнате:', roomCode, 'игрок:', name);
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
