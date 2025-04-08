import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import styles from './GamePage.module.css';
import socketApi from '@/shared/api/socketApi';
import videoApi from '@/shared/api/videoApi';
import PlayerVideo from './PlayerVideo';
import { FaMicrophone, FaMicrophoneSlash, FaVideo, FaVideoSlash } from 'react-icons/fa';

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
  const [localStream, setLocalStream] = useState(null);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 3;

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
    const initVideo = async () => {
      try {
        setLoading(true);
        setError(null);

        // Проверяем доступность медиаустройств
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasVideoDevices = devices.some(device => device.kind === 'videoinput');
        const hasAudioDevices = devices.some(device => device.kind === 'audioinput');

        if (!hasVideoDevices && !hasAudioDevices) {
          throw new Error('Не найдены доступные медиаустройства');
        }

        // Запрашиваем разрешение на доступ к медиаустройствам
        const stream = await navigator.mediaDevices.getUserMedia({
          video: hasVideoDevices,
          audio: hasAudioDevices
        });

        // Проверяем наличие треков
        const videoTracks = stream.getVideoTracks();
        const audioTracks = stream.getAudioTracks();

        if (videoTracks.length === 0 && audioTracks.length === 0) {
          throw new Error('Не удалось получить доступ к медиаустройствам');
        }

        setLocalStream(stream);
        setLoading(false);

        // Обработка отключения треков
        videoTracks.forEach(track => {
          track.onended = () => {
            console.log('Video track ended');
            setVideoEnabled(false);
          };
        });

        audioTracks.forEach(track => {
          track.onended = () => {
            console.log('Audio track ended');
            setAudioEnabled(false);
          };
        });

      } catch (err) {
        console.error('Error initializing video:', err);
        setError(err.message);
        
        if (retryCount < maxRetries) {
          setTimeout(() => {
            setRetryCount(prev => prev + 1);
            initVideo();
          }, 2000);
        } else {
          setLoading(false);
        }
      }
    };

    initVideo();

    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [retryCount]);

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
    if (localStream) {
      const videoTracks = localStream.getVideoTracks();
      videoTracks.forEach(track => {
        track.enabled = !videoEnabled;
      });
      setVideoEnabled(!videoEnabled);
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !audioEnabled;
      });
      setAudioEnabled(!audioEnabled);
    }
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
                stream={localStream}
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
