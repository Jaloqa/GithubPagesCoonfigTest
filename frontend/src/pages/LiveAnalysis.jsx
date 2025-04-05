import React, { useState, useEffect } from 'react';
import gameApi from '../shared/api/socketApi';

const LiveAnalysis = () => {
  const [roomState, setRoomState] = useState(null);
  const [error, setError] = useState(null);
  const [roomCode, setRoomCode] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Получаем код комнаты из URL или localStorage
    const code = localStorage.getItem('roomCode') || 'ROOM_CODE';
    setRoomCode(code);

    const handleStateUpdate = (state) => {
      setIsLoading(false);
      if (state && state.players) {
        setRoomState(state);
        setError(null);
      } else {
        setError('Некорректные данные комнаты');
      }
    };

    const handleError = (err) => {
      setIsLoading(false);
      setError(err.message || 'Произошла ошибка при загрузке данных');
    };

    // Начинаем опрос состояния комнаты
    gameApi.startPolling(code, handleStateUpdate, handleError);

    // Очистка при размонтировании
    return () => {
      gameApi.stopPolling();
    };
  }, []);

  if (isLoading) {
    return (
      <div className="loading-container">
        <h2>Загрузка...</h2>
        <p>Пожалуйста, подождите, пока загружаются данные комнаты.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <h2>Ошибка</h2>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Обновить страницу</button>
      </div>
    );
  }

  if (!roomState || !roomState.players) {
    return (
      <div className="error-container">
        <h2>Ошибка</h2>
        <p>Данные комнаты недоступны</p>
      </div>
    );
  }

  return (
    <div className="analysis-container">
      <h2>Анализ игры</h2>
      <div className="room-info">
        <h3>Информация о комнате</h3>
        <p>Код комнаты: {roomCode}</p>
        <p>Статус игры: {roomState.gameStarted ? 'Игра началась' : 'Ожидание игроков'}</p>
      </div>
      
      <div className="players-list">
        <h3>Игроки</h3>
        {roomState.players.map(player => (
          <div key={player.id} className="player-item">
            <p>Имя: {player.name}</p>
            <p>Роль: {player.isHost ? 'Хост' : 'Игрок'}</p>
            {roomState.characters && roomState.characters[player.id] && (
              <p>Персонаж: {roomState.characters[player.id]}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default LiveAnalysis; 