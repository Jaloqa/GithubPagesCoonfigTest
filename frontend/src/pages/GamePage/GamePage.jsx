import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import styles from './GamePage.module.css';
import socketApi from '@/shared/api/socketApi';
import videoApi from '@/shared/api/videoApi';
import PlayerVideo from './PlayerVideo';

export const GamePage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [serverStatus, setServerStatus] = useState('connecting'); // 'connecting', 'connected', 'error'
  const [notes, setNotes] = useState('');
  const [editingCharacter, setEditingCharacter] = useState(null);
  const [newCharacter, setNewCharacter] = useState('');
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const localVideoRef = useRef(null);
  const [remoteStreams, setRemoteStreams] = useState({});

  const [gameState, setGameState] = useState({
    roomCode: '',
    players: [],
    isHost: false,
    playerName: '',
    gameStarted: false,
    playerId: '',
    // Карта кто кому загадывает слова (playerId -> assignedToPlayerId)
    characterAssignments: {},
    // Персонажи, присвоенные игрокам
    characters: {}
  });

  // Подсказки для наводящих вопросов
  const hintQuestions = [
    "Я человек?",
    "Я вымышленный персонаж?",
    "Я живу в наше время?",
    "Я известная личность?",
    "Я спортсмен?",
    "Я актер/актриса?",
    "Я музыкант?",
    "Я политик?",
    "Я старше 50 лет?",
    "Я мужчина?",
    "Я женщина?"
  ];

  // Вспомогательная функция для формирования понятного сообщения об ошибке
  const getMediaErrorMessage = (error) => {
    if (!error) {
      return 'Неизвестная ошибка при доступе к камере';
    }
    
    switch(error.name) {
      case 'NotAllowedError':
        return 'Доступ к камере запрещен. Пожалуйста, разрешите доступ к камере в настройках браузера и перезагрузите страницу.';
      case 'NotFoundError':
        return 'Камера не найдена. Проверьте, что камера подключена и работает.';
      case 'NotReadableError':
        return 'Камера уже используется другим приложением. Закройте другие приложения, использующие камеру, и перезагрузите страницу.';
      case 'OverconstrainedError':
        return 'Запрошенное разрешение камеры недоступно. Попробуйте с меньшими параметрами.';
      case 'AbortError':
        return 'Операция прервана. Попробуйте еще раз.';
      case 'SecurityError':
        return 'Использование камеры заблокировано настройками безопасности браузера.';
      case 'TypeError':
        return 'Неподдерживаемый тип параметров для доступа к камере.';
      default:
        return `Ошибка при доступе к камере: ${error.message || error.name}`;
    }
  };

  // Получение параметров из URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const name = params.get('name');
    const room = params.get('room');
    const isHost = params.get('host') === 'true';

    if (!name || !room) {
      navigate('/');
      return;
    }

    setGameState(prev => ({
      ...prev,
      playerName: name,
      roomCode: room,
      isHost: isHost
    }));
  }, [location.search, navigate]);

  // Инициализация сокета и обработчиков событий
  useEffect(() => {
    if (!gameState.roomCode || !gameState.playerName) return;
    
    console.log('Инициализация соединения с комнатой:', gameState.roomCode);
    setServerStatus('connecting');
    
    // Инициализируем соединение
    const socket = socketApi.init();
    
    // Обработчики событий
    const handleRoomUpdated = (data) => {
      console.log('Получено обновление комнаты:', data);
      
      // Удаляем дубликаты игроков по ID
      const uniquePlayers = data.players.filter(
        (player, index, self) => index === self.findIndex(p => p.id === player.id)
      );
      
      // Обновляем состояние игры
      setGameState(prev => ({
        ...prev,
        players: uniquePlayers,
        gameStarted: data.gameStarted || prev.gameStarted,
        // Сохраняем другие данные из обновления
        characterAssignments: data.characterAssignments || prev.characterAssignments,
        characters: data.characters || prev.characters
      }));
    };
    
    const handleGameStarted = (data) => {
      console.log('Игра началась:', data);
      setGameState(prev => ({
        ...prev,
        gameStarted: true,
        characterAssignments: data.characterAssignments
      }));
    };
    
    const handleCharacterAssigned = (data) => {
      console.log('Получен персонаж:', data);
      setGameState(prev => ({
        ...prev,
        characters: {
          ...prev.characters,
          [socketApi.getSocketId()]: data.character
        }
      }));
    };
    
    const handleConnect = () => {
      console.log('Соединение установлено');
      setServerStatus('connected');
      setError('');
      
      // Присоединяемся к комнате или создаем новую
      if (gameState.isHost) {
        socketApi.createRoom(gameState.playerName);
      } else {
        socketApi.joinRoom(gameState.roomCode, gameState.playerName);
      }
    };
    
    // Устанавливаем обработчики
    socketApi.on('room-updated', handleRoomUpdated);
    socketApi.on('game-started', handleGameStarted);
    socketApi.on('character-assigned', handleCharacterAssigned);
    socketApi.on('connect', handleConnect);
    
    // Если уже подключены, присоединяемся к комнате
    if (socketApi.isConnected()) {
      handleConnect();
    }
    
    // Очистка при размонтировании
    return () => {
      socketApi.off('room-updated', handleRoomUpdated);
      socketApi.off('game-started', handleGameStarted);
      socketApi.off('character-assigned', handleCharacterAssigned);
      socketApi.off('connect', handleConnect);
    };
  }, [gameState.roomCode, gameState.playerName, gameState.isHost]);

  // Инициализация видео
  useEffect(() => {
    if (!gameState.roomCode || !gameState.playerName || serverStatus !== 'connected') return;
    
    console.log('Инициализация видео для комнаты:', gameState.roomCode);
    
    // Callback для обработки входящего потока
    const handleRemoteStream = (playerId, stream) => {
      console.log('Получен удаленный поток от:', playerId, 
        stream ? `Видеотреков: ${stream.getVideoTracks().length}, Аудиотреков: ${stream.getAudioTracks().length}` : 'Нет потока');
      
      if (stream) {
        // Проверяем, есть ли в потоке треки или это canvas-поток
        if (stream.getTracks().length > 0 || stream.isCanvasStream) {
          setRemoteStreams(prev => ({
            ...prev,
            [playerId]: stream
          }));
        } else {
          console.warn(`Поток от ${playerId} не содержит треков и не является canvas-потоком, игнорируем`);
        }
      }
    };
    
    // Callback для удаления потока
    const handleRemoteStreamRemoved = (playerId) => {
      console.log('Удален удаленный поток от:', playerId);
      setRemoteStreams(prev => {
        const newStreams = { ...prev };
        delete newStreams[playerId];
        return newStreams;
      });
    };
    
    // Функция для устранения проблем с разрешениями доступа
    const initVideoWithRetry = async (attempt = 1) => {
      try {
        console.log(`Попытка инициализации видео ${attempt}/3`);
        const localStream = await videoApi.init(gameState.roomCode, handleRemoteStream, handleRemoteStreamRemoved);
        
        console.log('Локальный поток инициализирован:', 
          localStream ? `Видеотреков: ${localStream.getVideoTracks().length}, Аудиотреков: ${localStream.getAudioTracks().length}` : 'Нет потока');
        
        // Устанавливаем локальный поток в видео элемент
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream;
        }
        
        // Сохраняем ID сокета для идентификации локального игрока
        const socketId = socketApi.getSocketId();
        if (socketId) {
          setGameState(prev => ({
            ...prev,
            playerId: socketId
          }));
        }
        
        // Обновляем статус видео и аудио на основе реального состояния
        setVideoEnabled(videoApi.isVideoEnabled());
        setAudioEnabled(videoApi.isAudioEnabled());
        
        return true;
      } catch (error) {
        console.error(`Ошибка при инициализации видео (попытка ${attempt}/3):`, error);
        
        if (attempt < 3) {
          console.log(`Повторная попытка через 1 секунду...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          return initVideoWithRetry(attempt + 1);
        }
        
        // Все попытки не удались
        setError(getMediaErrorMessage(error));
        setVideoEnabled(false);
        setAudioEnabled(false);
        
        // Всё равно устанавливаем ID игрока
        const socketId = socketApi.getSocketId();
        if (socketId) {
          setGameState(prev => ({
            ...prev,
            playerId: socketId
          }));
        }
        
        return false;
      }
    };
    
    // Запускаем инициализацию с возможностью повторной попытки
    initVideoWithRetry();
    
    // Очистка при размонтировании
    return () => {
      videoApi.stop();
    };
  }, [gameState.roomCode, gameState.playerName, serverStatus]);

  // Обработчик для начала игры
  const handleStartGame = () => {
    if (!gameState.isHost) return;
    socketApi.startGame(gameState.roomCode);
  };

  // Обработчик для назначения персонажа
  const handleAssignCharacter = (targetPlayerId) => {
    if (!newCharacter.trim()) {
      setError('Введите имя персонажа');
    return;
    }
    
    socketApi.emit('assign-character', {
      roomCode: gameState.roomCode,
      targetPlayerId,
      character: newCharacter
    });
    
    setNewCharacter('');
    setEditingCharacter(null);
  };

  // Обработчики для включения/отключения видео и аудио
  const toggleVideo = () => {
    const newState = !videoEnabled;
    videoApi.toggleVideo(newState);
    setVideoEnabled(newState);
  };

  const toggleAudio = () => {
    const newState = !audioEnabled;
    videoApi.toggleAudio(newState);
    setAudioEnabled(newState);
  };

  // Выход из игры
  const handleLeaveGame = () => {
    videoApi.stop();
      navigate('/');
  };

  return (
    <div className={styles.gamePage}>
      {/* Верхняя панель с информацией об игре */}
      <div className={styles.gameHeader}>
        <div className={styles.roomInfo}>
          <h2>Комната: {gameState.roomCode}</h2>
          {serverStatus === 'connecting' && <div className={styles.connecting}>Подключение...</div>}
          {serverStatus === 'error' && <div className={styles.error}>{error || 'Ошибка подключения'}</div>}
        </div>
          <div className={styles.gameControls}>
          {gameState.isHost && !gameState.gameStarted && (
            <button className={styles.startButton} onClick={handleStartGame}>
              Начать игру
            </button>
          )}
          <button className={styles.leaveButton} onClick={handleLeaveGame}>
            Выйти
          </button>
        </div>
      </div>

      {/* Основной контент игры */}
      <div className={styles.gameContent}>
        {/* Сетка с видео игроков */}
        <div className={styles.videoGrid}>
          {/* Локальный игрок */}
          <div className={`${styles.videoBox} ${styles.localVideo}`}>
            <PlayerVideo
              stream={localVideoRef.current?.srcObject || null}
              playerId={gameState.playerId}
              playerName={gameState.playerName}
              character={gameState.characters[gameState.playerId]}
              isCurrentPlayer={true}
              isVideoEnabled={videoEnabled}
              isAudioEnabled={audioEnabled}
            />
            <div className={styles.videoControls}>
              <button 
                className={videoEnabled ? styles.videoOn : styles.videoOff} 
                onClick={toggleVideo}
                title={videoEnabled ? "Выключить камеру" : "Включить камеру"}
              >
                {videoEnabled ? '🎥' : '🚫'}
              </button>
              <button 
                className={audioEnabled ? styles.audioOn : styles.audioOff} 
                onClick={toggleAudio}
                title={audioEnabled ? "Выключить микрофон" : "Включить микрофон"}
              >
                {audioEnabled ? '🔊' : '🔇'}
              </button>
            </div>
          </div>

          {/* Удаленные игроки */}
          {gameState.players
            .filter(player => player.id !== gameState.playerId)
            .filter((player, index, self) => 
              // Удаляем дубликаты по ID
              index === self.findIndex(p => p.id === player.id)
            )
            .map((player) => (
              <div key={`player-${player.id}`} className={styles.videoBox}>
                  <PlayerVideo 
                  stream={remoteStreams[player.id]}
                  playerId={player.id}
                  playerName={player.name}
                  character={gameState.characters[player.id]}
                  isCurrentPlayer={false}
                  isVideoEnabled={true}
                  isAudioEnabled={true}
                />
                {gameState.gameStarted && gameState.characterAssignments[gameState.playerId] === player.id && (
                  <div className={styles.assignCharacter}>
                    {editingCharacter === player.id ? (
                      <div className={styles.characterForm}>
                        <input
                          type="text"
                          value={newCharacter}
                          onChange={(e) => setNewCharacter(e.target.value)}
                          placeholder="Введите персонажа"
                        />
                        <div className={styles.formButtons}>
                          <button onClick={() => handleAssignCharacter(player.id)}>Назначить</button>
                          <button onClick={() => setEditingCharacter(null)}>Отмена</button>
                        </div>
                      </div>
                    ) : (
                      <button 
                        onClick={() => setEditingCharacter(player.id)}
                        className={styles.assignButton}
                      >
                        Назначить персонажа
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
                </div>
                
        {/* Боковая панель игры */}
        <div className={styles.gameSidebar}>
          {gameState.gameStarted ? (
            <>
              <div className={styles.gameInfo}>
                <h3>Игра началась!</h3>
                {gameState.characters[gameState.playerId] ? (
                  <p>Ваш персонаж: <strong>???</strong></p>
                ) : (
                  <p>Ожидайте, пока вам загадают персонажа</p>
                )}
                  </div>
                  
              <div className={styles.hintQuestions}>
                <h3>Подсказки для вопросов:</h3>
                <ul>
                      {hintQuestions.map((question, index) => (
                    <li key={index}>{question}</li>
                      ))}
                    </ul>
                  </div>
              
              <div className={styles.notes}>
                <h3>Ваши заметки:</h3>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Записывайте здесь свои догадки..."
                  className={styles.notesArea}
                />
              </div>
            </>
          ) : (
            <div className={styles.waitingRoom}>
              <h3>Ожидание игроков</h3>
              <p>В комнате {gameState.players.length} игроков</p>
              <ul className={styles.playersList}>
                {gameState.players.map((player, index) => (
                  <li key={`player-list-${player.id}-${index}`}>
                    {player.name} {player.isHost && ' (Хост)'}
                    {player.id === gameState.playerId && ' (Вы)'}
                  </li>
                ))}
              </ul>
              {gameState.isHost && gameState.players.length >= 2 ? (
                <p>Можно начинать игру!</p>
              ) : gameState.isHost ? (
                <p>Нужно минимум 2 игрока для начала игры</p>
              ) : (
                <p>Ожидайте, когда хост начнет игру</p>
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className={styles.errorModal}>
          <div className={styles.errorContent}>
            <h3>Произошла ошибка</h3>
            <p>{error}</p>
            <div className={styles.errorActions}>
              <button 
                onClick={() => setError('')}
                className={styles.continueButton}
              >
                Продолжить без камеры
              </button>
            </div>
          </div>
      </div>
      )}

      {/* Скрытый видео элемент для локального потока */}
      <video
        ref={localVideoRef}
        autoPlay
        playsInline
        muted
        style={{ display: 'none' }}
      />
    </div>
  );
};
