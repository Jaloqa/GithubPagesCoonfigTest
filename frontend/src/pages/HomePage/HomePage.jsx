import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './HomePage.module.css';
import socketApi from '@/shared/api/socketApi';

export const HomePage = () => {
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const navigate = useNavigate();

  // Инициализация сокета при первой загрузке страницы
  useEffect(() => {
    // Инициализируем соединение
    const socket = socketApi.init();
    
    // Проверяем соединение
    const checkConnection = () => {
      const connected = socketApi.isConnected();
      setIsConnected(connected);
      if (!connected) {
        console.log('Переподключение к серверу...');
        setError('Ожидание подключения к серверу. Убедитесь, что сервер запущен.');
      } else {
        setError('');
      }
    };
    
    // Проверяем соединение сразу
    checkConnection();
    
    // И периодически проверяем соединение
    const connectionTimer = setInterval(checkConnection, 3000);

    // Слушаем событие создания комнаты
    socketApi.on('room-created', (data) => {
      setIsLoading(false);
      console.log('Комната создана:', data);
      
      if (data.success) {
        // После успешного создания комнаты перенаправляем на страницу игры
        navigate(`/game?name=${encodeURIComponent(name)}&room=${encodeURIComponent(data.roomCode)}&host=true`);
      } else {
        // Показываем ошибку при неудачном создании
        setError(data.error || 'Не удалось создать комнату');
      }
    });

    // Слушаем событие присоединения к комнате
    socketApi.on('room-joined', (data) => {
      setIsLoading(false);
      console.log('Присоединение к комнате:', data);
      
      if (data.success) {
        // После успешного присоединения перенаправляем на страницу игры
        navigate(`/game?name=${encodeURIComponent(name)}&room=${encodeURIComponent(roomCode)}`);
      } else {
        // Показываем ошибку
        setError(data.error || 'Не удалось присоединиться к комнате');
      }
    });

    // Слушаем ошибки соединения
    socketApi.on('connect_error', (err) => {
      console.error('Ошибка соединения Socket.IO:', err);
      setError(`Ошибка соединения с сервером: ${err.message}`);
      setIsLoading(false);
    });

    // Очистка при размонтировании
    return () => {
      clearInterval(connectionTimer);
      socketApi.off('room-created');
      socketApi.off('room-joined');
      socketApi.off('connect_error');
    };
  }, [navigate, name, roomCode]);

  const handleCreateRoom = () => {
    if (!isConnected) {
      setError('Нет соединения с сервером. Пожалуйста, подождите или перезагрузите страницу.');
      return;
    }

    if (!name.trim()) {
      setError('Введите ваше имя');
      return;
    }

    setError('');
    setIsLoading(true);
    
    try {
      console.log('Отправка запроса на создание комнаты:', name);
      // Отправляем запрос на создание комнаты
      socketApi.createRoom(name);
    } catch (err) {
      console.error('Ошибка при создании комнаты:', err);
      setError(`Ошибка соединения с сервером: ${err.message}`);
      setIsLoading(false);
    }
  };

  const handleJoinRoom = () => {
    if (!isConnected) {
      setError('Нет соединения с сервером. Пожалуйста, подождите или перезагрузите страницу.');
      return;
    }

    if (!name.trim()) {
      setError('Введите ваше имя');
      return;
    }

    if (!roomCode.trim()) {
      setError('Введите код комнаты');
      return;
    }

    setError('');
    setIsLoading(true);
    
    try {
      console.log('Отправка запроса на присоединение к комнате:', roomCode, name);
      // Отправляем запрос на присоединение к комнате
      socketApi.joinRoom(roomCode, name);
    } catch (err) {
      console.error('Ошибка при присоединении к комнате:', err);
      setError(`Ошибка соединения с сервером: ${err.message}`);
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.homePage}>
      <div className={styles.container}>
        <h1 className={styles.title}>Who Am I?</h1>
        <p className={styles.subtitle}>A fun game to play with your friends</p>
        
        {!isConnected && (
          <div className={styles.connectionStatus}>
            Connecting to server...
          </div>
        )}
        
        {error && <div className={styles.errorMessage}>{error}</div>}
        
        <div className={`${styles.formGroup} ${styles.nameInput}`}>
          <input
            type="text"
            className={styles.input}
            placeholder="Enter name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isLoading || !isConnected}
          />
        </div>
        
        <div className={styles.formGroup}>
          <button 
            className={styles.createButton}
            onClick={handleCreateRoom}
            disabled={isLoading || !isConnected}
          >
            {isLoading ? 'Creating...' : 'Create room'}
          </button>
        </div>
        
        <div className={styles.divider}>or</div>
        
        <div className={styles.formGroup}>
          <input
            type="text"
            className={styles.input}
            placeholder="Room code"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            disabled={isLoading || !isConnected}
          />
        </div>
        
        <div className={styles.formGroup}>
          <button 
            className={styles.joinButton}
            onClick={handleJoinRoom}
            disabled={isLoading || !isConnected}
          >
            {isLoading ? 'Joining...' : 'Join'}
          </button>
        </div>
      </div>
    </div>
  );
};
