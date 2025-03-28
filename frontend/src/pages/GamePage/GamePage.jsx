import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import styles from './GamePage.module.css';
import socketApi from '@/shared/api/socketApi';
import PlayerVideo from './PlayerVideo';

export const GamePage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const videoRefs = useRef({});
  const [notes, setNotes] = useState('');
  const [editingCharacter, setEditingCharacter] = useState(null);
  const [newCharacter, setNewCharacter] = useState('');
  const [error, setError] = useState('');
  const [serverStatus, setServerStatus] = useState('connecting'); // 'connecting', 'connected', 'error'
  const [gameState, setGameState] = useState({
    roomCode: '',
    players: [],
    isHost: false,
    playerName: '',
    gameStarted: false,
    currentCharacter: '',
    // Карта кто кому загадывает слова (playerId -> assignedToPlayerId)
    characterAssignments: {}
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

  // Эффект для проверки статуса сервера при загрузке компонента
  useEffect(() => {
    console.log('Запуск проверки статуса сервера');
    let mounted = true;
    let connectionTimeout = null;
    
    const checkConnection = async () => {
      if (!mounted) return;
      
      setServerStatus('connecting');
      setError('');
      
      try {
        // Инициализируем сокет
        const socket = socketApi.init();
        
        if (!mounted) return;
        
        // Логируем текущее состояние сокета
        console.log('Текущее состояние сокета:', socketApi.getSocketStateString());
        
        // Обработчики событий
        const handleConnect = () => {
          if (!mounted) return;
          console.log('Соединение с сервером установлено');
          console.log('Новое состояние сокета:', socketApi.getSocketStateString());
          setServerStatus('connected');
          setError('');
        };
        
        const handleConnectError = (err) => {
          if (!mounted) return;
          console.error('Ошибка подключения к серверу:', err);
          console.log('Состояние сокета при ошибке:', socketApi.getSocketStateString());
          setServerStatus('error');
          setError('Ошибка подключения к серверу. Убедитесь, что сервер запущен и обновите страницу.');
        };
        
        // Устанавливаем таймаут для подключения
        connectionTimeout = setTimeout(() => {
          if (!mounted) return;
          console.error('Таймаут подключения к серверу');
          console.log('Состояние сокета при таймауте:', socketApi.getSocketStateString());
          setServerStatus('error');
          setError('Не удалось подключиться к серверу. Убедитесь, что сервер запущен и обновите страницу.');
        }, 8000); // 8 секунд на подключение
        
        // Проверяем текущее состояние соединения
        if (socket.connected) {
          console.log('Сокет уже подключен');
          clearTimeout(connectionTimeout);
          handleConnect();
        } else {
          // Добавляем обработчики событий
          socket.once('connect', () => {
            clearTimeout(connectionTimeout);
            handleConnect();
          });
          
          socket.once('connect_error', (error) => {
            clearTimeout(connectionTimeout);
            handleConnectError(error);
          });
        }
      } catch (err) {
        if (!mounted) return;
        console.error('Ошибка при инициализации сокета:', err);
        setServerStatus('error');
        setError('Ошибка при инициализации сокета. Убедитесь, что сервер запущен и обновите страницу.');
      }
    };
    
    // Запускаем проверку соединения
    checkConnection();
    
    // Функция очистки при размонтировании
    return () => {
      mounted = false;
      if (connectionTimeout) {
        clearTimeout(connectionTimeout);
      }
    };
  }, []);
  
  // Функция для повторной попытки подключения
  const retryConnection = useCallback(() => {
    console.log('Попытка повторного подключения к серверу...');
    
    // Закрываем существующее соединение
    socketApi.disconnect();
    
    // Устанавливаем состояние
    setServerStatus('connecting');
    setError('');
    
    // Пытаемся подключиться снова
    const socket = socketApi.init();
    
    // Обработчики для нового соединения
    const handleConnect = () => {
      console.log('Повторное соединение установлено');
      setServerStatus('connected');
      setError('');
    };
    
    const handleConnectError = (err) => {
      console.error('Ошибка повторного подключения:', err);
      setServerStatus('error');
      setError('Ошибка повторного подключения. Убедитесь, что сервер запущен и попробуйте еще раз.');
    };
    
    // Устанавливаем таймаут
    const retryTimeout = setTimeout(() => {
      setServerStatus('error');
      setError('Время ожидания повторного подключения истекло. Попробуйте еще раз или вернитесь на главную страницу.');
    }, 10000);
    
    // Добавляем обработчики
    socket.once('connect', () => {
      clearTimeout(retryTimeout);
      handleConnect();
    });
    
    socket.once('connect_error', (error) => {
      clearTimeout(retryTimeout);
      handleConnectError(error);
    });
    
  }, []);

  // Примеры персонажей
  const characterExamples = [
    "Гарри Поттер", "Дарт Вейдер", "Мэрилин Монро", "Альберт Эйнштейн",
    "Винни Пух", "Бэтмен", "Чебурашка", "Эрнесто Че Гевара",
    "Джокер", "Микки Маус", "Наполеон", "Клеопатра"
  ];

  useEffect(() => {
    // Если сервер не подключен, не пытаемся подключаться к комнате
    if (serverStatus !== 'connected') {
      console.log('Сервер не подключен, пропускаем подключение к комнате');
      return;
    }
    
    console.log('Сервер подключен, подключаемся к комнате');
    
    // Инициализация сокета
    socketApi.init();

    // Получаем данные из URL параметров или localStorage
    const params = new URLSearchParams(location.search);
    const name = params.get('name') || localStorage.getItem('playerName');
    const room = params.get('room') || localStorage.getItem('roomCode');
    const isHost = params.get('host') === 'true' || localStorage.getItem('isHost') === 'true';

    if (!name || !room) {
      // Если имя или код комнаты не указаны, возвращаемся на главную
      navigate('/');
      return;
    }

    // Сохраняем данные в localStorage
    localStorage.setItem('playerName', name);
    localStorage.setItem('roomCode', room);
    localStorage.setItem('isHost', isHost);

    // Обновляем состояние
    setGameState(prev => ({
      ...prev,
      playerName: name,
      roomCode: room,
      isHost: isHost,
      players: []
    }));

    // Настраиваем обработчики событий WebSocket
    socketApi.on('room-updated', (data) => {
      console.log('Комната обновлена:', data);
      setGameState(prev => ({
        ...prev,
        players: data.players,
        gameStarted: data.gameStarted
      }));
    });

    socketApi.on('game-started', (data) => {
      console.log('Игра началась:', data);
      setGameState(prev => ({
        ...prev,
        gameStarted: true,
        characterAssignments: data.characterAssignments
      }));
    });

    // Добавляем обработчики WebRTC событий
    const handlePlayerJoined = (data) => {
      console.log('Новый игрок присоединился:', data);
    };

    const handlePlayerLeft = (data) => {
      console.log('Игрок покинул комнату:', data);
    };

    socketApi.onPlayerJoined(handlePlayerJoined);
    socketApi.onPlayerLeft(handlePlayerLeft);

    // Подключаемся к комнате если мы еще не хост
    if (!isHost) {
      console.log('Присоединение к комнате:', room, name);
      socketApi.joinRoom(room, name);
    } else {
      // Если мы хост, нам нужно отправить запрос на получение обновлений комнаты
      console.log('Запрос обновления комнаты для хоста:', room);
      socketApi.emit('get-room-info', { roomCode: room });
    }

    // Очистка при размонтировании
    return () => {
      socketApi.off('room-updated');
      socketApi.off('game-started');
      socketApi.off('player-joined', handlePlayerJoined);
      socketApi.off('player-left', handlePlayerLeft);
      
      // Выход из комнаты только если пользователь действительно покидает страницу
      if (gameState.roomCode && !window.location.href.includes(gameState.roomCode)) {
        console.log('Покидаем комнату:', gameState.roomCode);
        socketApi.leaveRoom(gameState.roomCode);
      }
    };
  }, [location, navigate, gameState.roomCode, serverStatus]);

  // Эффект для инициализации камеры и mediasoup при загрузке компонента
  useEffect(() => {
    let mounted = true;
    let initTimer = null;
    let mediasoupInitialized = false;

    const initializeMedia = async () => {
      // Функция заглушка для совместимости
      console.log('Инициализация видео отключена');
      return;
    };

    // Настройка обработчиков для входящих медиа-потоков
    const setupMediaHandlers = () => {
      // Функция заглушка для совместимости
      console.log('Настройка видео отключена');
      return;
    };

    // Не запускаем инициализацию сразу, даем время на рендеринг компонентов
    if (serverStatus === 'connected' && gameState.roomCode && !mediasoupInitialized) {
      initTimer = setTimeout(() => {
        initializeMedia();
      }, 1000);
    }

    return () => {
      mounted = false;
      if (initTimer) {
        clearTimeout(initTimer);
      }
      
      // НЕ очищаем ресурсы mediasoup при размонтировании этого эффекта
      // Очистка будет производиться только при выходе из компонента или комнаты
    };
  }, [gameState.roomCode, serverStatus]);

  // Добавляем отдельный эффект для очистки ресурсов при размонтировании компонента
  useEffect(() => {
    return () => {
      // Очищаем ресурсы mediasoup только при полном размонтировании компонента
      if (mediasoupApi.initialized) {
        console.log('Очистка ресурсов mediasoup при размонтировании компонента');
        mediasoupApi.cleanup();
      }
    };
  }, []);

  // Эффект для обновления видео после получения потока - оптимизируем
  useEffect(() => {
    if (!mediasoupApi.initialized) return;
    
    const myId = socketApi.getSocketId();
    console.log('Обновление локального видео для:', myId);
    
    // Используем единый таймаут для всех попыток
    let timeoutId = null;
    
    // Функция для обновления видео с повторными попытками
    const updateVideoWithRetries = () => {
      // Функция заглушка для совместимости
      return;
    };
    
    // Запускаем первую попытку
    updateVideoWithRetries();
    
    // Очистка при размонтировании
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [mediasoupApi.initialized]);

  // Эффект для отображения видео после обновления списка игроков или изменения статуса игры
  useEffect(() => {
    if (!mediasoupApi.initialized) return;
    
    const myId = socketApi.getSocketId();
    
    console.log('Обновление видео после изменения списка игроков или статуса игры:', {
      myId, 
      playersCount: gameState.players.length,
      gameStarted: gameState.gameStarted,
      refs: Object.keys(videoRefs.current),
      localStreamActive: !!mediasoupApi.initialized,
      cameraEnabled
    });
    
    // Устанавливаем флаг для предотвращения проблем с обновлением при размонтировании
    let mounted = true;
    
    // Не сбрасываем потоки сразу для всех элементов, чтобы избежать мерцания
    // Вместо этого будем обновлять только те элементы, которые этого требуют
    
    const timer = setTimeout(() => {
      if (!mounted) return;
      
      // Проверяем и обновляем свой собственный видеоэлемент
      const updateMyVideo = () => {
        // Сначала пытаемся найти через DOM
        const videoElement = document.querySelector(`video[data-player-id="${myId}"]`);
        if (videoElement) {
          if (!videoElement.srcObject || videoElement.srcObject !== mediasoupApi.getLocalStream()) {
            console.log('Найден видеоэлемент через DOM, устанавливаем поток');
            videoElement.srcObject = mediasoupApi.getLocalStream();
          }
        } 
        // Если не нашли через DOM, пробуем через refs
        else if (videoRefs.current[myId]) {
          if (!videoRefs.current[myId].srcObject || videoRefs.current[myId].srcObject !== mediasoupApi.getLocalStream()) {
            console.log('Найден видеоэлемент через refs, устанавливаем поток');
            videoRefs.current[myId].srcObject = mediasoupApi.getLocalStream();
          }
        } 
        // Если все еще не нашли, попробуем позже
        else {
          console.log('Видеоэлемент не найден, запланируем еще одну попытку');
          // Пробуем еще раз через небольшую задержку
          setTimeout(() => {
            if (!mounted) return;
            
            const delayedVideoElement = document.querySelector(`video[data-player-id="${myId}"]`);
            if (delayedVideoElement) {
              if (!delayedVideoElement.srcObject || delayedVideoElement.srcObject !== mediasoupApi.getLocalStream()) {
                console.log('Найден видеоэлемент после дополнительной задержки, устанавливаем поток');
                delayedVideoElement.srcObject = mediasoupApi.getLocalStream();
              }
            }
          }, 1000);
        }
      };
      
      // Запускаем обновление своего видео
      updateMyVideo();
      
    }, 500); // Уменьшена задержка для более быстрого обновления
    
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [mediasoupApi.initialized]);

  // Эффект для подключения к медиа-потокам других игроков при изменении списка игроков
  useEffect(() => {
    if (!gameState.roomCode || serverStatus !== 'connected') {
      return;
    }

    // Устанавливаем флаг для предотвращения проблем при размонтировании
    let mounted = true;
    let connectionTimer = null;
    let reconnectTimeoutId = null;

    // Проверяем mediasoup через интервал
    const checkMediasoupConnections = () => {
      reconnectTimeoutId = setTimeout(async () => {
        if (!mounted) return;
        
        try {
          // Проверяем, инициализирован ли mediasoup
          if (mediasoupApi.initialized && mediasoupApi.getLocalStream()) {
            // Проверяем и восстанавливаем соединения, если необходимо
            const reconnected = await mediasoupApi.reconnectIfNeeded();
            if (reconnected) {
              console.log('WebRTC соединения проверены и восстановлены');
              
              // После успешного переподключения, пробуем подключиться к потокам других игроков
              if (mounted) {
                connectToPlayerStreams();
              }
            }
          }
        } catch (err) {
          console.error('Ошибка при проверке медиа соединений:', err);
        }
        
        // Запускаем следующую проверку
        if (mounted) {
          checkMediasoupConnections();
        }
      }, 15000); // Проверяем каждые 15 секунд
    };

    // Функция для получения потоков других игроков
    const connectToPlayerStreams = async () => {
      // Функция заглушка для совместимости
      console.log('Подключение к потокам игроков отключено');
      return;
    };
    
    // Запускаем первую проверку медиасоединений
    checkMediasoupConnections();
    
    // Выполняем подключение к потокам с небольшой задержкой
    connectionTimer = setTimeout(() => {
      if (mounted) {
        connectToPlayerStreams();
      }
    }, 2000);
    
    return () => {
      mounted = false;
      if (connectionTimer) {
        clearTimeout(connectionTimer);
      }
      if (reconnectTimeoutId) {
        clearTimeout(reconnectTimeoutId);
      }
    };
  }, [gameState.roomCode, gameState.players, serverStatus]);

  const startGame = () => {
    // Отправляем запрос на начало игры на сервер
    if (!gameState.roomCode) return;
    console.log('Отправка запроса на начало игры:', gameState.roomCode);
    socketApi.startGame(gameState.roomCode);
  };

  // Функция для отображения видео
  const getVideoRef = (playerId) => (element) => {
    // Функция заглушка для совместимости
    return;
  };

  // Функция для копирования кода комнаты
  const copyRoomCode = () => {
    navigator.clipboard.writeText(gameState.roomCode);
    alert(`Код комнаты ${gameState.roomCode} скопирован в буфер обмена`);
  };

  // Включение/выключение камеры
  const toggleCamera = async () => {
    // Функция заглушка для совместимости
    console.log('Камера отключена в этой версии приложения');
    return;
  };

  // Включение/выключение микрофона
  const toggleMicrophone = async () => {
    // Функция заглушка для совместимости
    console.log('Микрофон отключен в этой версии приложения');
    return;
  };

  // Обработчик изменения заметок
  const handleNotesChange = (e) => {
    setNotes(e.target.value);
  };

  // Начать редактирование персонажа
  const startEditingCharacter = (targetPlayerId) => {
    setEditingCharacter(targetPlayerId);
    
    // Находим текущего персонажа, если он уже был установлен
    const targetPlayer = gameState.players.find(p => p.id === targetPlayerId);
    setNewCharacter(targetPlayer.character || '');
  };

  // Сохранить изменения персонажа
  const saveCharacter = () => {
    if (!editingCharacter || !newCharacter.trim()) return;
    
    // Отправляем изменения на сервер
    socketApi.setCharacter(gameState.roomCode, editingCharacter, newCharacter.trim());
    
    setEditingCharacter(null);
    setNewCharacter('');
  };

  // Отменить редактирование
  const cancelEditing = () => {
    setEditingCharacter(null);
    setNewCharacter('');
  };

  // Получить случайного персонажа
  const getRandomCharacter = () => {
    const randomIndex = Math.floor(Math.random() * characterExamples.length);
    setNewCharacter(characterExamples[randomIndex]);
  };

  // Определить, кому текущий игрок загадывает персонажа
  const whoAmIAssigning = () => {
    const myId = socketApi.getSocketId();
    if (!myId) return null;
    return gameState.characterAssignments[myId] || null;
  };

  // Поиск своего индекса в массиве игроков
  const findMyIndex = () => {
    const myId = socketApi.getSocketId();
    if (!myId) return -1;
    return gameState.players.findIndex(player => player.id === myId);
  };

  // Компонент для отображения видео игрока
  const PlayerCharacterInfo = ({ player }) => {
    const isMe = player.id === socketApi.getSocketId();
    const isMyAssignment = whoAmIAssigning() === player.id;
    
    return (
      <div className={styles.characterInfo}>
        <div className={styles.playerLabel}>
          {player.name}
          {isMe && <span className={styles.meBadge}>Вы</span>}
          {player.isHost && <span className={styles.hostBadge}>Хост</span>}
          {isMyAssignment && <span className={styles.assignBadge}>Загадайте персонажа</span>}
        </div>
        
        {/* Для игрока, которому я загадываю */}
        {isMyAssignment && (
          <div className={styles.characterControls}>
            {editingCharacter === player.id ? (
              <div className={styles.characterEditForm}>
                <input 
                  type="text" 
                  className={styles.characterInput}
                  value={newCharacter}
                  onChange={(e) => setNewCharacter(e.target.value)}
                  placeholder="Введите персонажа..."
                  autoFocus
                />
                
                <div className={styles.editButtons}>
                  <button 
                    className={styles.randomButton} 
                    onClick={getRandomCharacter}
                    title="Случайный персонаж"
                  >
                    🎲
                  </button>
                  <button 
                    className={styles.saveButton} 
                    onClick={saveCharacter}
                    disabled={!newCharacter.trim()}
                  >
                    Сохранить
                  </button>
                  <button 
                    className={styles.cancelButton} 
                    onClick={cancelEditing}
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.characterDisplay}>
                <div className={styles.characterName}>
                  {player.character ? 
                    `Персонаж: ${player.character}` : 
                    'Нажмите, чтобы загадать персонажа'}
                </div>
                
                <button 
                  className={styles.editButton}
                  onClick={() => startEditingCharacter(player.id)}
                >
                  {player.character ? 'Изменить' : 'Загадать'}
                </button>
              </div>
            )}
          </div>
        )}
        
        {/* Для меня */}
        {isMe && (
          <div className={styles.characterLabel}>
            Ваш персонаж: ???
          </div>
        )}
        
        {/* Для других игроков, которым я не загадываю */}
        {!isMe && !isMyAssignment && (
          <div className={styles.characterLabel}>
            Персонаж: {player.character || 'Ожидание...'}
          </div>
        )}
      </div>
    );
  };

  // Обработчик для кнопки "Вернуться в меню"
  const handleBackButtonClick = useCallback(() => {
    try {
      console.log('Выход из комнаты:', gameState.roomCode);
      // Останавливаем все медиа-треки
      if (mediasoupApi.getLocalStream()) {
        mediasoupApi.getLocalStream().getTracks().forEach(track => {
          try {
            track.stop();
          } catch (e) {
            console.error('Ошибка при остановке трека:', e);
          }
        });
      }
      
      // Очищаем ресурсы mediasoup
      try {
        mediasoupApi.cleanup();
      } catch (e) {
        console.error('Ошибка при очистке mediasoup:', e);
      }
      
      // Выходим из комнаты
      if (gameState.roomCode) {
        try {
          socketApi.leaveRoom(gameState.roomCode);
        } catch (e) {
          console.error('Ошибка при выходе из комнаты:', e);
        }
      }
      
      // Переходим на главную страницу
      navigate('/');
    } catch (error) {
      console.error('Ошибка при возврате в меню:', error);
      // Принудительно переходим на главную страницу
      window.location.href = '/';
    }
  }, [gameState.roomCode, mediasoupApi.getLocalStream, navigate]);

  // Эффект для автоматического переподключения при изменении статуса сервера
  useEffect(() => {
    console.log('Статус сервера изменился:', serverStatus);
    let reconnectTimeout = null;
    let mounted = true;
    
    // Если статус сервера - ошибка, пробуем переподключиться через 5 секунд
    if (serverStatus === 'error') {
      console.log('Установка таймера для автоматического переподключения');
      reconnectTimeout = setTimeout(() => {
        if (!mounted) return;
        console.log('Автоматическая повторная попытка подключения (таймаут)...');
        retryConnection();
      }, 5000);
    } 
    // Если сервер подключен, проверяем и восстанавливаем WebRTC соединения
    else if (serverStatus === 'connected') {
      console.log('Сервер подключен, проверяем WebRTC соединения');
      
      const checkAndReconnect = async () => {
        try {
          if (!mounted) return;
          
          if (mediasoupApi.getLocalStream()) {
            // Проверяем, инициализирован ли mediasoup
            if (!mediasoupApi.initialized && gameState.roomCode) {
              console.log('Mediasoup не инициализирован, выполняем инициализацию для комнаты', gameState.roomCode);
              await mediasoupApi.init(gameState.roomCode);
              // Если инициализация прошла успешно, публикуем существующий поток
              if (mediasoupApi.initialized) {
                console.log('Публикуем существующий поток после инициализации');
                await mediasoupApi.publishStream(mediasoupApi.getLocalStream());
              }
            } else if (mediasoupApi.initialized) {
              // Проверяем и восстанавливаем соединения, если необходимо
              const reconnected = await mediasoupApi.reconnectIfNeeded();
              if (reconnected) {
                console.log('WebRTC соединения проверены и восстановлены');
              }
            }
          }
        } catch (error) {
          console.error('Ошибка при проверке и восстановлении соединений:', error);
        }
      };
      
      // Запускаем проверку с небольшой задержкой
      reconnectTimeout = setTimeout(() => {
        checkAndReconnect();
      }, 1000);
    }
    
    return () => {
      mounted = false;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, [serverStatus, retryConnection]);

  // Добавляю опцию для запуска без камеры
  const startGameWithoutCamera = () => {
    // Функция заглушка для совместимости
    console.log('Игра без камеры');
    return;
  };

  return (
    <div className={styles.gamePage}>
      <div className={styles.gameContainer}>
        <div className={styles.header}>
          <h1 className={styles.title}>
            {gameState.roomCode ? `Комната: ${gameState.roomCode}` : 'Загрузка...'}
          </h1>
          
          <div className={styles.gameControls}>
            <span className={styles.playerInfo}>
              Вы: {gameState.playerName}
            </span>
            
            {!gameState.gameStarted && gameState.isHost && serverStatus === 'connected' && (
              <button 
                className={styles.startButton}
                onClick={startGame}
              >
                Начать игру
              </button>
            )}
            
            {!gameState.gameStarted && serverStatus === 'connected' && (
              <button 
                className={styles.copyButton}
                onClick={copyRoomCode}
              >
                Копировать код
              </button>
            )}
            
            <button 
              className={styles.backButton}
              onClick={handleBackButtonClick}
            >
              Вернуться в меню
            </button>
          </div>
        </div>

        {error ? (
          <div className={styles.errorMessage}>
            <p>{error}</p>
            <div className={styles.errorActions}>
              {error.includes('доступ к камере запрещен') || error.includes('Доступ к камере заблокирован') || error.includes('используется другим приложением') ? (
                <>
                  <button
                    className={styles.retryButton}
                    onClick={async () => {
                      try {
                        const permissionStatus = await navigator.permissions.query({ name: 'camera' });
                        
                        // Если разрешение не получено, направляем пользователя
                        if (permissionStatus.state === 'denied') {
                          setError('Чтобы разрешить доступ к камере:' +
                            '\n1. Нажмите на иконку замка/информации в адресной строке' +
                            '\n2. Найдите "Разрешения" или "Права сайта"' +
                            '\n3. Разрешите доступ к камере' +
                            '\n4. Обновите страницу (F5)'
                          );
                        } else {
                          // Если разрешение получено или ожидается повторный запрос
                          setError(null);
                          initializeMedia();
                        }
                      } catch (e) {
                        // Если не удалось проверить разрешения, просто запрашиваем еще раз
                        setError(null);
                        initializeMedia();
                      }
                    }}
                  >
                    Разрешить доступ к камере
                  </button>
                  <button 
                    className={styles.retryButton}
                    onClick={async () => {
                      try {
                        // Создаем временный видеоэлемент для открытия системного диалога выбора камеры
                        const tempVideo = document.createElement('video');
                        tempVideo.style.position = 'fixed';
                        tempVideo.style.top = '-9999px';
                        tempVideo.style.left = '-9999px';
                        document.body.appendChild(tempVideo);
                        
                        // Получаем список устройств
                        const devices = await navigator.mediaDevices.enumerateDevices();
                        const videoDevices = devices.filter(device => device.kind === 'videoinput');
                        
                        if (videoDevices.length > 0) {
                          console.log('Доступные камеры:', videoDevices);
                          
                          // Открываем системный диалог выбора устройства
                          // Для этого запрашиваем доступ с указанием deviceId: 'default'
                          const stream = await navigator.mediaDevices.getUserMedia({
                            audio: false,
                            video: { deviceId: 'default' }
                          });
                          
                          // Останавливаем поток, он нам не нужен, только для вызова диалога
                          stream.getTracks().forEach(track => track.stop());
                          
                          // Удаляем временный элемент
                          document.body.removeChild(tempVideo);
                          
                          // Запускаем инициализацию снова
                          setError(null);
                          initializeMedia();
                        } else {
                          setError('Не найдено ни одной камеры. Подключите камеру и перезагрузите страницу.');
                        }
                      } catch (err) {
                        console.error('Ошибка при попытке показать диалог выбора камеры:', err);
                        setError(`Не удалось открыть диалог выбора камеры: ${err.message}`);
                      }
                    }}
                  >
                    Выбрать другую камеру
                  </button>
                  <button 
                    className={styles.altButton}
                    onClick={startGameWithoutCamera}
                  >
                    Продолжить без камеры
                  </button>
                  <button 
                    className={styles.homeButton}
                    onClick={() => navigate('/')}
                  >
                    Вернуться на главную
                  </button>
                </>
              ) : (
                <>
                  <button 
                    className={styles.retryButton}
                    onClick={() => {
                      setError(null);
                      initializeMedia();
                    }}
                  >
                    Повторить
                  </button>
                  <button 
                    className={styles.altButton}
                    onClick={startGameWithoutCamera}
                  >
                    Продолжить без камеры
                  </button>
                </>
              )}
            </div>
          </div>
        ) : serverStatus === 'connecting' ? (
          <div className={styles.loadingMessage}>
            <div className={styles.spinner}></div>
            <p>Подключение к серверу...</p>
          </div>
        ) : serverStatus === 'connected' && !gameState.gameStarted ? (
          <div className={styles.lobby}>
            <h2>Ожидание игроков...</h2>
            <p className={styles.lobbyInfo}>
              Поделитесь кодом комнаты <strong>{gameState.roomCode}</strong> с друзьями, чтобы они могли присоединиться. Всего может участвовать до 6 игроков.
            </p>
            
            <div className={styles.videoGrid}>
              {gameState.players.length === 0 ? (
                <div className={styles.noPlayersMessage}>
                  <p>Ожидание подключения игроков...</p>
                  <p>Если вы не видите себя в списке игроков, попробуйте обновить страницу.</p>
                </div>
              ) : (
                gameState.players.map((player) => (
                  <PlayerVideo 
                    key={player.id} 
                    player={player} 
                    localStream={mediasoupApi.getLocalStream()}
                    cameraEnabled={mediasoupApi.initialized}
                    micEnabled={mediasoupApi.initialized}
                    toggleCamera={toggleCamera}
                    toggleMicrophone={toggleMicrophone}
                    remoteStreams={remoteStreams}
                  />
                ))
              )}
            </div>
          </div>
        ) : serverStatus === 'connected' && gameState.gameStarted ? (
          <div className={styles.gameArea}>
            <div className={styles.gameContent}>
              <h2>Игра началась!</h2>
              <p className={styles.gameDescription}>
                Задавайте другим игрокам вопросы, на которые можно ответить "да" или "нет", чтобы выяснить, кто вы. 
                Угадайте свой персонаж раньше остальных!
              </p>
              
              <div className={styles.mainGameLayout}>
                <div className={styles.videoSection}>
                  <div className={styles.videoGrid}>
                    {gameState.players.map((player) => (
                      <div key={player.id} className={styles.videoAndControls}>
                        <PlayerVideo 
                          player={player} 
                          localStream={mediasoupApi.getLocalStream()}
                          cameraEnabled={mediasoupApi.initialized}
                          micEnabled={mediasoupApi.initialized}
                          toggleCamera={toggleCamera}
                          toggleMicrophone={toggleMicrophone}
                          remoteStreams={remoteStreams}
                        />
                        <PlayerCharacterInfo player={player} />
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className={styles.sidePanel}>
                  <div className={styles.notesSection}>
                    <h3>Мои заметки</h3>
                    <textarea 
                      className={styles.notesArea} 
                      placeholder="Записывайте свои мысли и подсказки здесь..." 
                      value={notes}
                      onChange={handleNotesChange}
                    />
                  </div>
                  
                  <div className={styles.hintsSection}>
                    <h3>Примеры вопросов</h3>
                    <ul className={styles.hintsList}>
                      {hintQuestions.map((question, index) => (
                        <li key={index} className={styles.hintItem}>{question}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
