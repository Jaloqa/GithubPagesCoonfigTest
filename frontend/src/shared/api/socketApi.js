import { io } from 'socket.io-client';

class GameApi {
  constructor() {
    this.socket = null;
    this.roomCode = null;
    this.playerId = null;
    this.lastActivity = Date.now();
    this.pollingInterval = null;
    this.isConnecting = false;
    // Локальные обработчики событий (не связанные с сокетом напрямую)
    this._handlers = {};
    this.connect();
  }

  connect() {
    if (this.socket && this.socket.connected) return;
    if (this.isConnecting) return;
    
    this.isConnecting = true;
    
    try {
      console.log('Подключение к socket.io...');
      // Сохраняем ссылку на сокет как статическое свойство
      if (!GameApi.socket) {
        GameApi.socket = io('http://localhost:3002', {
          reconnectionDelayMax: 10000,
          reconnectionAttempts: 5,
          transports: ['websocket', 'polling'],
          autoConnect: true
        });
      }
      
      this.socket = GameApi.socket;

      if (!this._setupComplete) {
        this._setupEventHandlers();
        this._setupComplete = true;
      }
      
      if (!this.socket.connected) {
        this.socket.connect();
      } else {
        // Уже подключены, вызываем событие вручную
        this._emitLocalEvent('connect');
      }
    } catch (error) {
      console.error('Ошибка при создании Socket.IO соединения:', error);
      this._emitLocalEvent('error', {message: 'Ошибка подключения: ' + error.message});
    } finally {
      this.isConnecting = false;
    }
  }
  
  // Настраиваем обработчики событий
  _setupEventHandlers() {
    this.socket.on('connect', () => {
      console.log('Socket.IO соединение установлено, ID:', this.socket.id);
      
      if (this.roomCode && this.playerId) {
        this.reconnectToRoom(this.roomCode, this.playerId);
      }
      
      // Вызываем локальное событие подключения
      this._emitLocalEvent('connect');
    });

    this.socket.on('disconnect', () => {
      console.log('Socket.IO соединение закрыто');
      this._emitLocalEvent('disconnect');
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket.IO ошибка соединения:', error);
      this._emitLocalEvent('error', {message: 'Ошибка подключения: ' + error.message});
    });
    
    // Переименовываем событие для совместимости
    this.socket.on('room-created', (data) => {
      console.log('Комната создана:', data);
      if (data && data.roomCode) {
        this.roomCode = data.roomCode;
        this.playerId = data.playerId || this.socket.id;
        localStorage.setItem('roomCode', data.roomCode);
        localStorage.setItem('playerId', this.playerId);
        
        // Эмитируем новое событие для маршрутизации в интерфейсе
        this._emitLocalEvent('room-created', data);
      }
    });
    
    // Переименовываем событие для совместимости
    this.socket.on('join-room-success', (data) => {
      console.log('Успешное присоединение к комнате:', data);
      if (data && data.roomCode) {
        this.roomCode = data.roomCode;
        this.playerId = data.playerId || this.socket.id;
        localStorage.setItem('roomCode', data.roomCode);
        localStorage.setItem('playerId', this.playerId);
        
        // Эмитируем дополнительное событие для совместимости с интерфейсом
        this._emitLocalEvent('room-joined', { success: true, ...data });
      }
    });

    // Обрабатываем ошибки при подключении к комнате
    this.socket.on('join-room-error', (error) => {
      console.error('Ошибка при присоединении к комнате:', error);
      this._emitLocalEvent('error', error);
    });

    this.socket.on('create-room-error', (error) => {
      console.error('Ошибка при создании комнаты:', error);
      this._emitLocalEvent('error', error);
    });
  }
  
  _emitLocalEvent(event, data) {
    console.log(`Эмитируем локальное событие: ${event}`, data);
    if (this._handlers[event]) {
      this._handlers[event].forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Ошибка в обработчике события ${event}:`, error);
        }
      });
    }
  }

  on(event, callback) {
    if (!callback || typeof callback !== 'function') {
      console.error(`Попытка зарегистрировать недопустимый обработчик для события ${event}`);
      return;
    }
    
    if (!this._handlers[event]) {
      this._handlers[event] = [];
    }
    
    // Проверяем, не добавлен ли уже этот обработчик
    if (!this._handlers[event].includes(callback)) {
      this._handlers[event].push(callback);
      console.log(`Добавлен обработчик для события ${event}, всего: ${this._handlers[event].length}`);
    }
    
    // Для событий сокета добавляем обработчик только если это не локальное событие
    if (this.socket && !['connect', 'disconnect', 'error', 'room-joined', 'room-created'].includes(event)) {
      this.socket.on(event, data => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Ошибка в обработчике события сокета ${event}:`, error);
        }
      });
    }
    
    // Если это событие 'connect' и мы уже подключены - сразу вызываем обработчик
    if (event === 'connect' && this.socket && this.socket.connected) {
      try {
        callback();
      } catch (error) {
        console.error(`Ошибка в обработчике события connect:`, error);
      }
    }
  }

  off(event, callback) {
    if (this._handlers[event]) {
      // Если callback не указан, удаляем все обработчики для события
      if (!callback) {
        this._handlers[event] = [];
      } else {
        this._handlers[event] = this._handlers[event].filter(handler => handler !== callback);
      }
      console.log(`Удален обработчик для события ${event}, осталось: ${this._handlers[event].length}`);
    }
    
    // Для событий сокета также удаляем обработчик
    if (this.socket) {
      if (callback) {
        this.socket.off(event, callback);
      } else if (event) {
        this.socket.off(event);
      }
    }
  }

  emit(event, data) {
    // Всегда проверяем соединение перед отправкой
    this.connect();
    
    if (this.socket && this.socket.connected) {
      console.log(`Отправка события ${event}:`, data);
      this.socket.emit(event, data);
      this.lastActivity = Date.now();
    } else {
      console.error('Socket.IO не подключен, невозможно отправить событие:', event);
    }
  }

  // Создание комнаты
  createRoom(playerName) {
    console.log('Создание комнаты для игрока:', playerName);
    this.emit('create-room', { playerName });
  }

  // Присоединение к комнате
  joinRoom(roomCode, playerName) {
    console.log('Присоединение к комнате:', roomCode, 'игрок:', playerName);
    this.roomCode = roomCode;
    this.emit('join-room', { roomCode, playerName });
  }

  // Переподключение к комнате
  reconnectToRoom(roomCode, playerId) {
    console.log('Переподключение к комнате:', roomCode, 'игрок:', playerId);
    this.roomCode = roomCode;
    this.playerId = playerId;
    this.emit('reconnect-room', { roomCode, playerId });
  }

  // Начало игры
  startGame(roomCode) {
    this.emit('start-game', { roomCode });
  }

  // Получение списка игроков
  getPlayers(roomCode) {
    this.emit('get-players', { roomCode });
  }

  // Установка персонажа
  setCharacter(roomCode, targetPlayerId, character) {
    this.emit('set-character', { roomCode, targetPlayerId, character });
  }

  // Выход из комнаты
  leaveRoom(roomCode, playerId) {
    this.emit('leave-room', { roomCode, playerId });
    this.roomCode = null;
    this.playerId = null;
    localStorage.removeItem('roomCode');
    localStorage.removeItem('playerId');
  }

  // Получение состояния комнаты
  getRoomState(roomCode) {
    this.emit('get-room-state', { roomCode });
  }

  // Обновление состояния игрока
  updatePlayerState(roomCode, playerState) {
    this.emit('update-player-state', { roomCode, playerState });
  }

  // Обновление активности игрока
  updateActivity(roomCode, playerId) {
    this.emit('update-activity', { roomCode, playerId });
  }

  // Периодический опрос состояния комнаты
  startPolling(roomCode, onUpdate, onError) {
    if (!roomCode) {
      onError(new Error('Код комнаты не указан'));
      return;
    }

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    const poll = async () => {
      try {
        const response = await fetch(`/api/room/${roomCode}`);
        if (!response.ok) {
          throw new Error(`Ошибка сервера: ${response.status}`);
        }
        const data = await response.json();
        if (data && typeof data === 'object') {
          onUpdate(data);
        } else {
          throw new Error('Некорректный формат данных');
        }
      } catch (error) {
        console.error('Ошибка при опросе комнаты:', error);
        onError(error);
      }
    };

    // Уменьшаем частоту опроса, чтобы снизить нагрузку
    this.pollingInterval = setInterval(poll, 10000);
    
    // Сразу делаем первый опрос
    setTimeout(poll, 500);
  }

  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  isConnected() {
    return this.socket && this.socket.connected;
  }
  
  init() {
    this.connect();
    return this;
  }
  
  getSocketId() {
    return this.socket ? this.socket.id : null;
  }

  getRoomCode() {
    return this.roomCode;
  }

  getPlayerId() {
    return this.playerId;
  }
}

// Статическое свойство для хранения общего соединения
GameApi.socket = null;

export default new GameApi(); 