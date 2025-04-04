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
  }

  connect() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return;
    }

    this.socket = new WebSocket(this.baseUrl);

    this.socket.onopen = () => {
      console.log('WebSocket connection established');
      this.reconnectAttempts = 0;
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
    this.send('join-room', { roomCode, playerName });
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
  leaveRoom(roomCode) {
    this.send('leave-room', { roomCode });
  }

  // Получение состояния комнаты
  getRoomState(roomCode) {
    this.send('get-room-state', { roomCode });
  }

  // Обновление состояния игрока
  updatePlayerState(roomCode, playerState) {
    this.send('update-player-state', { roomCode, playerState });
  }

  // Периодический опрос состояния комнаты
  startPolling(roomCode, callback, interval = 2000) {
    if (this._pollingInterval) {
      clearInterval(this._pollingInterval);
    }

    this._pollingInterval = setInterval(() => {
      this.getRoomState(roomCode);
    }, interval);

    this.on('room-state', callback);
  }

  stopPolling() {
    if (this._pollingInterval) {
      clearInterval(this._pollingInterval);
      this._pollingInterval = null;
    }
  }

  isConnected() {
    return this.socket && this.socket.readyState === WebSocket.OPEN;
  }
}

export default new GameApi(); 