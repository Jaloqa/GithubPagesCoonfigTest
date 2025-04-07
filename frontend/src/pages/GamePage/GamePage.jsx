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
  const [gameStartTimer, setGameStartTimer] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
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
    characters: {},
    maxPlayers: 8
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
        characterAssignments: data.characterAssignments || prev.characterAssignments,
        characters: data.characters || prev.characters,
        maxPlayers: data.maxPlayers || prev.maxPlayers
      }));

      // Если игра не началась и есть таймер, обновляем его
      if (!data.gameStarted && data.startGameTimer) {
        setGameStartTimer(data.startGameTimer);
        setTimeLeft(Math.ceil((data.startGameTimer - Date.now()) / 1000));
      }
    };
    
    const handleGameStarted = (data) => {
      console.log('Игра началась:', data);
      setGameState(prev => ({
        ...prev,
        gameStarted: true,
        characterAssignments: data.characterAssignments
      }));
      setGameStartTimer(null);
      setTimeLeft(0);
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

    const handleConnectionFailed = () => {
      setServerStatus('error');
      setError('Не удалось подключиться к серверу. Пожалуйста, попробуйте позже.');
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
    socketApi.on('connection-failed', handleConnectionFailed);
    
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
      socketApi.off('connection-failed', handleConnectionFailed);
      if (gameStartTimer) {
        clearInterval(gameStartTimer);
      }
    };
  }, [gameState.roomCode, gameState.playerName, gameState.isHost]);

  // Таймер обратного отсчета
  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [timeLeft]);

  // Эффект для инициализации видео
  useEffect(() => {
    let mounted = true;
    let retryCount = 0;
    const maxRetries = 3;

    // Функция для инициализации видео с повторами при ошибке
    const initVideoWithRetry = async () => {
      if (!mounted) return;
      
      if (retryCount >= maxRetries) {
        console.error('Превышено максимальное количество попыток подключения видео');
        setError('Не удалось инициализировать видео после нескольких попыток');
        return;
      }
      
      try {
        console.log(`Инициализация видео для комнаты ${gameState.roomCode}, попытка ${retryCount + 1}/${maxRetries}`);
        
        if (!socketApi.isConnected()) {
          console.warn('Сокет не подключен, ожидаем подключения перед инициализацией видео');
          setError('Ожидание подключения к серверу...');
          setTimeout(() => {
            if (mounted) {
              retryCount++;
              initVideoWithRetry();
            }
          }, 2000);
          return;
        }
        
        // Обработчик получения удаленного потока
        const handleRemoteStream = (playerId, stream) => {
          console.log(`Получен удаленный поток от игрока ${playerId}`);
          
          if (!mounted) {
            console.log(`Компонент размонтирован, игнорируем поток от ${playerId}`);
            return;
          }
          
          // Логируем информацию о потоке
          const videoTrack = stream.getVideoTracks()[0];
          if (videoTrack) {
            console.log(`Видеотрек от ${playerId}:`, {
              enabled: videoTrack.enabled,
              readyState: videoTrack.readyState,
              muted: videoTrack.muted,
              settings: videoTrack.getSettings()
            });
          }
          
          setRemoteStreams(prev => {
            // Создаем копию предыдущего состояния
            const newStreams = { ...prev };
            // Добавляем новый поток
            newStreams[playerId] = stream;
            return newStreams;
          });
        };
        
        // Обработчик удаления удаленного потока
        const handleRemoteStreamRemoved = (playerId) => {
          console.log(`Удален удаленный поток игрока ${playerId}`);
          
          if (!mounted) {
            console.log(`Компонент размонтирован, игнорируем удаление потока от ${playerId}`);
            return;
          }
          
          setRemoteStreams(prev => {
            // Создаем копию без удаленного потока
            const newStreams = { ...prev };
            delete newStreams[playerId];
            return newStreams;
          });
        };
        
        // Инициализируем видео API
        const stream = await videoApi.init(gameState.roomCode, handleRemoteStream, handleRemoteStreamRemoved);
        
        if (!mounted) {
          // Если компонент был размонтирован во время инициализации
          console.log('Компонент размонтирован во время инициализации видео');
          videoApi.stop();
          return;
        }
        
        if (!stream) {
          console.error('Не удалось получить локальный поток');
          setError('Не удалось получить доступ к камере');
          
          // Пробуем еще раз
          if (retryCount < maxRetries - 1) {
            retryCount++;
            setTimeout(() => {
              if (mounted) {
                initVideoWithRetry();
              }
            }, 2000);
            return;
          }
        }
        
        // Логируем информацию о полученном потоке
        console.log('Локальный видеопоток получен:', videoApi.getStreamInfo(stream));
        
        // Устанавливаем локальный поток в видео элемент
        if (localVideoRef.current) {
          try {
            localVideoRef.current.srcObject = stream;
            console.log('Локальный поток установлен в видеоэлемент');
          } catch (err) {
            console.error('Ошибка при установке локального потока:', err);
            setError(`Ошибка при отображении локального видео: ${err.message}`);
          }
        } else {
          console.warn('localVideoRef.current не определен');
        }
        
        // Сохраняем ID сокета для идентификации локального игрока
        const socketId = socketApi.getSocketId();
        if (socketId) {
          console.log('ID сокета получен:', socketId);
          setGameState(prev => ({
            ...prev,
            playerId: socketId
          }));
        } else {
          console.warn('Не удалось получить ID сокета');
        }
        
        // Обновляем статус видео и аудио на основе реального состояния
        const videoIsEnabled = videoApi.isVideoEnabled();
        const audioIsEnabled = videoApi.isAudioEnabled();
        console.log(`Статус видео: ${videoIsEnabled}, статус аудио: ${audioIsEnabled}`);
        setVideoEnabled(videoIsEnabled);
        setAudioEnabled(audioIsEnabled);
        
        // Запрашиваем список всех игроков в комнате для соединения
        socketApi.emit('get-players', { roomCode: gameState.roomCode });
        
      } catch (error) {
        console.error('Ошибка при инициализации видео:', error);
        
        if (mounted) {
          setError(`Ошибка видео: ${error.message || 'Неизвестная ошибка'}`);
          retryCount++;
          console.log(`Повторная попытка через 2 секунды (${retryCount}/${maxRetries})...`);
          setTimeout(() => {
            if (mounted) {
              initVideoWithRetry();
            }
          }, 2000);
        }
      }
    };

    if (gameState.roomCode && socketApi.isConnected()) {
      console.log('Начинаем инициализацию видео');
      initVideoWithRetry();
    } else {
      console.log('Пропускаем инициализацию видео: комната', gameState.roomCode, 'сокет подключен:', socketApi.isConnected());
    }

    return () => {
      mounted = false;
      console.log('Размонтирование компонента GamePage, останавливаем видео API');
      if (videoApi) {
        videoApi.stop();
      }
    };
  }, [gameState.roomCode, gameState.gameStarted]);

  // Эффект для обработки изменения состояния игры
  useEffect(() => {
    if (gameState && gameState.gameStarted && !videoEnabled && gameState.players.length >= 2) {
      setVideoEnabled(true);
      // Запрашиваем состояние комнаты
      socketApi.emit('get-room-state', { roomCode: gameState.roomCode });
    }
  }, [gameState, videoEnabled, gameState.players.length, gameState.roomCode]);

  // Обработчик для начала игры
  const handleStartGame = () => {
    if (gameState.players.length < 2) {
      setError('Для начала игры нужно минимум 2 игрока');
      return;
    }
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
    if (gameState.playerId) {
      socketApi.leaveRoom(gameState.roomCode, gameState.playerId);
    }
    navigate('/');
  };

  return (
    <div className={styles.gamePage}>
      <div className={styles.header}>
        <div className={styles.roomInfo}>
          <span>Комната: {gameState.roomCode}</span>
          <span>Игроков: {gameState.players.length}/{gameState.maxPlayers}</span>
          {timeLeft > 0 && <span>До начала игры: {timeLeft}с</span>}
        </div>
        <button className={styles.leaveButton} onClick={handleLeaveGame}>
          Покинуть игру
        </button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {serverStatus === 'connecting' && (
        <div className={styles.loading}>Подключение к серверу...</div>
      )}

      {serverStatus === 'error' && (
        <div className={styles.error}>
          Ошибка подключения. Пожалуйста, проверьте соединение и попробуйте снова.
        </div>
      )}

      {serverStatus === 'connected' && (
        <div className={styles.gameArea}>
          <div className={styles.players}>
            {gameState.players.map(player => (
              <PlayerVideo
                key={player.id}
                player={player}
                stream={remoteStreams[player.id]}
                isCurrentPlayer={player.id === gameState.playerId}
              />
            ))}
          </div>

          {gameState.isHost && !gameState.gameStarted && (
            <button
              className={styles.startButton}
              onClick={handleStartGame}
              disabled={gameState.players.length < 2}
            >
              Начать игру
            </button>
          )}

          {/* Сетка с видео игроков */}
          <div className={styles.videoGrid}>
            {/* Локальный игрок */}
            <div className={`${styles.videoBox} ${styles.localVideo}`}>
              <PlayerVideo
                stream={localVideoRef.current?.srcObject}
                playerName={gameState.playerName}
                character={gameState.characters[gameState.playerId]}
                isCurrentPlayer={true}
                audioEnabled={audioEnabled}
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
                    playerName={player.name}
                    character={gameState.characters[player.id]}
                    isCurrentPlayer={false}
                    audioEnabled={true}
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
      )}

      {/* Скрытый видео элемент для локального потока */}
      <video
        ref={localVideoRef}
        autoPlay
        playsInline
        muted
        style={{ display: 'none' }}
        onError={(e) => {
          console.error('Ошибка в скрытом видео элементе:', e);
          setError('Ошибка загрузки видео с камеры');
        }}
        onLoadedMetadata={() => {
          console.log('Метаданные скрытого видео загружены:', 
            { width: localVideoRef.current?.videoWidth, height: localVideoRef.current?.videoHeight });
        }}
      />
    </div>
  );
};
