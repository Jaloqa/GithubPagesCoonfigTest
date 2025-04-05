class GameApi {
  constructor() {
    this.baseUrl = window.location.hostname === 'localhost' 
      ? 'ws://localhost:3001'
      : 'wss://github-pages-coonfig-test.vercel.app';
    this.socket = null;
    this.messageHandlers = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectTimeout = 1000;
    this.roomCode = null;
    this.playerId = null;
    this.lastActivity = Date.now();
  }

  connect() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return;
    }

    this.socket = new WebSocket(this.baseUrl);

    this.socket.onopen = () => {
      console.log('WebSocket connection established');
      this.reconnectAttempts = 0;
      
      // Если есть сохраненные данные комнаты, пытаемся переподключиться
      if (this.roomCode && this.playerId) {
        this.reconnectToRoom(this.roomCode, this.playerId);
      }
    };

    this.socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const { type, data } = message;
        
        if (this.messageHandlers.has(type)) {
          this.messageHandlers.get(type).forEach(handler => handler(data));
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    this.socket.onclose = () => {
      console.log('WebSocket connection closed');
      this.reconnect();
    };

    this.socket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  reconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      setTimeout(() => this.connect(), this.reconnectTimeout * this.reconnectAttempts);
    } else {
      console.error('Max reconnection attempts reached');
      if (this.messageHandlers.has('connection-failed')) {
        this.messageHandlers.get('connection-failed').forEach(handler => handler());
      }
    }
  }

  on(type, handler) {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, []);
    }
    this.messageHandlers.get(type).push(handler);
  }

  off(type, handler) {
    if (this.messageHandlers.has(type)) {
      const handlers = this.messageHandlers.get(type);
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  send(type, data) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type, data }));
      this.lastActivity = Date.now();
    } else {
      console.error('WebSocket is not connected');
    }
  }

  // Создание комнаты
  createRoom(playerName) {
    this.send('create-room', { playerName });
  }

  // Присоединение к комнате
  joinRoom(roomCode, playerName) {
    this.roomCode = roomCode;
    this.send('join-room', { roomCode, playerName });
  }

  // Переподключение к комнате
  reconnectToRoom(roomCode, playerId) {
    this.roomCode = roomCode;
    this.playerId = playerId;
    this.send('reconnect-room', { roomCode, playerId });
  }

  // Начало игры
  startGame(roomCode) {
    this.send('start-game', { roomCode });
  }

  // Получение списка игроков
  getPlayers(roomCode) {
    this.send('get-players', { roomCode });
  }

  // Установка персонажа
  setCharacter(roomCode, targetPlayerId, character) {
    this.send('set-character', { roomCode, targetPlayerId, character });
  }

  // Выход из комнаты
  leaveRoom(roomCode, playerId) {
    this.send('leave-room', { roomCode, playerId });
    this.roomCode = null;
    this.playerId = null;
  }

  // Получение состояния комнаты
  getRoomState(roomCode) {
    this.send('get-room-state', { roomCode });
  }

  // Обновление состояния игрока
  updatePlayerState(roomCode, playerState) {
    this.send('update-player-state', { roomCode, playerState });
  }

  // Обновление активности игрока
  async updateActivity(roomCode, playerId) {
    try {
      await this.send('update-activity', { roomCode, playerId });
    } catch (error) {
      if (error.response?.status === 429) {
        console.warn('Превышен лимит запросов к API. Повторная попытка через 60 секунд.');
        setTimeout(() => this.updateActivity(roomCode, playerId), 60000);
      } else {
        console.error('Ошибка при обновлении активности:', error);
      }
    }
  }

  // Периодический опрос состояния комнаты
  startPolling(roomCode, onUpdate, onError) {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    const poll = async () => {
      try {
        const state = await this.getRoomState(roomCode);
        if (onUpdate) {
          onUpdate(state);
        }
      } catch (error) {
        console.error('Ошибка при опросе состояния комнаты:', error);
        if (onError) {
          onError(error);
        }
      }
    };

    // Выполняем первый опрос сразу
    poll();

    // Затем опрашиваем каждые 5 секунд
    this.pollingInterval = setInterval(poll, 5000);
  }

  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  isConnected() {
    return this.socket && this.socket.readyState === WebSocket.OPEN;
  }

  getRoomCode() {
    return this.roomCode;
  }

  getPlayerId() {
    return this.playerId;
  }
}

export default new GameApi(); 