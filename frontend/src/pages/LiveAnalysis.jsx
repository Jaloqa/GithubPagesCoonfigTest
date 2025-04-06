import React, { useState, useEffect } from 'react';
import gameApi from '../shared/api/socketApi';

// Защищенная функция для получения данных из потенциально небезопасных объектов
function safeGet(obj, path, defaultValue = null) {
  if (!obj) return defaultValue;
  const keys = path.split('.');
  let result = obj;
  
  for (const key of keys) {
    if (result === null || result === undefined) return defaultValue;
    result = result[key];
  }
  
  return result !== undefined ? result : defaultValue;
}

const LiveAnalysis = () => {
  const [roomState, setRoomState] = useState(null);
  const [error, setError] = useState(null);
  const [roomCode, setRoomCode] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Проверка на существование localStorage
    let code;
    try {
      code = localStorage.getItem('roomCode') || 'DEMO_ROOM';
    } catch (e) {
      code = 'DEMO_ROOM';
      console.error('Ошибка доступа к localStorage:', e);
    }
    
    setRoomCode(code);
    console.log('Используется код комнаты:', code);

    const handleStateUpdate = (state) => {
      setIsLoading(false);
      try {
        if (state && typeof state === 'object') {
          console.log('Получено состояние комнаты:', state);
          
          // Безопасно извлекаем данные с защитой от undefined
          const players = Array.isArray(safeGet(state, 'players')) 
            ? safeGet(state, 'players') 
            : [];
            
          const characters = safeGet(state, 'characters', {});
          const gameStarted = Boolean(safeGet(state, 'gameStarted', false));
          
          setRoomState({
            ...state,
            players,
            characters,
            gameStarted
          });
          setError(null);
        } else {
          console.error('Некорректный формат данных:', state);
          throw new Error('Некорректный формат данных');
        }
      } catch (err) {
        console.error('Ошибка обработки данных:', err);
        setError(err.message || 'Неизвестная ошибка');
      }
    };

    const handleError = (err) => {
      setIsLoading(false);
      console.error('Ошибка при загрузке данных:', err);
      setError(err?.message || 'Произошла ошибка при загрузке данных');
    };

    try {
      if (!code) {
        throw new Error('Код комнаты не указан');
      }
      
      console.log('Запуск опроса комнаты:', code);
      gameApi.on('room-updated', handleStateUpdate);
      // Также подписываемся на событие создания/присоединения к комнате
      gameApi.on('room-created', data => {
        console.log('Получено событие создания комнаты:', data);
        // Обновляем код комнаты в локальном состоянии
        if (data && data.roomCode) {
          setRoomCode(data.roomCode);
        }
      });
      
      gameApi.getRoomState(code);
      
      // Запускаем API опрос только как резервный вариант
      try {
        gameApi.startPolling(code, handleStateUpdate, handleError);
      } catch (e) {
        console.error('Ошибка при запуске опроса:', e);
      }
    } catch (error) {
      console.error('Ошибка при инициализации:', error);
      setIsLoading(false);
      setError('Не удалось подключиться к серверу: ' + (error.message || ''));
    }

    return () => {
      gameApi.off('room-updated', handleStateUpdate);
      gameApi.stopPolling();
    };
  }, []);

  // Готовим заглушку с фейковыми данными если реальных нет
  useEffect(() => {
    if (isLoading && !error) {
      // Если данные не пришли через 5 секунд, показываем демо-данные
      const timer = setTimeout(() => {
        if (isLoading) {
          const demoData = {
            players: [
              { id: 'host1', name: 'Хост (Демо)', isHost: true },
              { id: 'player2', name: 'Игрок 2 (Демо)', isHost: false },
              { id: 'player3', name: 'Игрок 3 (Демо)', isHost: false }
            ],
            gameStarted: true,
            characters: {
              'host1': 'Гарри Поттер',
              'player2': 'Капитан Америка',
              'player3': 'Шерлок Холмс'
            }
          };
          
          setRoomState(demoData);
          setIsLoading(false);
          setError('Используются демо-данные. Сервер недоступен.');
        }
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [isLoading, error]);

  if (isLoading) {
    return (
      <div className="loading-container">
        <h2>Загрузка...</h2>
        <p>Пожалуйста, подождите, идет подключение к серверу.</p>
      </div>
    );
  }

  if (error && !roomState) {
    return (
      <div className="error-container">
        <h2>Ошибка</h2>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Обновить страницу</button>
      </div>
    );
  }

  if (!roomState || !Array.isArray(roomState.players)) {
    return (
      <div className="error-container">
        <h2>Ошибка</h2>
        <p>Данные комнаты недоступны или в неправильном формате</p>
        <button onClick={() => window.location.reload()}>Обновить страницу</button>
      </div>
    );
  }

  return (
    <div className="analysis-container">
      <h2>Анализ игры</h2>
      {error && (
        <div className="warning">
          <p>Предупреждение: {error}</p>
        </div>
      )}
      <div className="room-info">
        <h3>Информация о комнате</h3>
        <p>Код комнаты: {roomCode || 'Не указан'}</p>
        <p>Статус игры: {roomState.gameStarted ? 'Игра началась' : 'Ожидание игроков'}</p>
      </div>
      
      <div className="players-list">
        <h3>Игроки ({roomState.players.length})</h3>
        {roomState.players.map(player => (
          <div key={player?.id || Math.random()} className="player-item">
            <p>Имя: {player?.name || 'Неизвестный игрок'}</p>
            <p>Роль: {player?.isHost ? 'Хост' : 'Игрок'}</p>
            {roomState.characters && player?.id && roomState.characters[player.id] && (
              <p>Персонаж: {roomState.characters[player.id]}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default LiveAnalysis; 