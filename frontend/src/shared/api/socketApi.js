import { io } from 'socket.io-client';
import mediasoupApi from './mediasoupApi';

class GameApi {
  constructor() {
    this.baseUrl = window.location.hostname === 'localhost' 
      ? 'http://localhost:3001'
      : 'https://github-pages-coonfig-test.vercel.app';
    this.headers = {
      'Content-Type': 'application/json',
      'x-vercel-protection-bypass': 'ODjj85wkLvMNdHMyTmekRQjzuLoPNBFw'
    };
  }

  async request(endpoint, method = 'GET', data = null) {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method,
        headers: this.headers,
        body: data ? JSON.stringify(data) : null,
        mode: 'cors',
        credentials: 'include',
        referrerPolicy: 'no-referrer'
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error(`API Error (${method} ${endpoint}):`, error);
      throw error;
    }
  }

  // Создание комнаты
  async createRoom(playerName) {
    try {
      const result = await this.request('/api/rooms/create', 'POST', { playerName });
      if (!result) {
        throw new Error('Не удалось создать комнату');
      }
      return result;
    } catch (error) {
      console.error('Ошибка при создании комнаты:', error);
      throw error;
    }
  }

  // Присоединение к комнате
  async joinRoom(roomCode, playerName) {
    try {
      const result = await this.request('/api/rooms/join', 'POST', { roomCode, playerName });
      return result;
    } catch (error) {
      console.error('Ошибка при присоединении к комнате:', error);
      return null;
    }
  }

  // Начало игры
  async startGame(roomCode) {
    try {
      const result = await this.request('/api/games/start', 'POST', { roomCode });
      return result;
    } catch (error) {
      console.error('Ошибка при начале игры:', error);
      return null;
    }
  }

  // Получение списка игроков в комнате
  async getPlayers(roomCode) {
    try {
      const result = await this.request(`/api/rooms/${roomCode}/players`);
      return result;
    } catch (error) {
      console.error('Ошибка при получении списка игроков:', error);
      return null;
    }
  }

  // Установка персонажа для игрока
  async setCharacter(roomCode, targetPlayerId, character) {
    try {
      const result = await this.request('/api/players/character', 'POST', {
        roomCode,
        targetPlayerId,
        character
      });
      return result;
    } catch (error) {
      console.error('Ошибка при установке персонажа:', error);
      return null;
    }
  }

  // Выход из комнаты
  async leaveRoom(roomCode) {
    try {
      const result = await this.request(`/api/rooms/${roomCode}/leave`, 'POST');
      return result;
    } catch (error) {
      console.error('Ошибка при выходе из комнаты:', error);
      return null;
    }
  }

  // Получение состояния комнаты
  async getRoomState(roomCode) {
    try {
      const result = await this.request(`/api/rooms/${roomCode}/state`);
      return result;
    } catch (error) {
      console.error('Ошибка при получении состояния комнаты:', error);
      return null;
    }
  }

  // Обновление состояния игрока
  async updatePlayerState(roomCode, playerState) {
    try {
      const result = await this.request(`/api/rooms/${roomCode}/player-state`, 'POST', playerState);
      return result;
    } catch (error) {
      console.error('Ошибка при обновлении состояния игрока:', error);
      return null;
    }
  }

  // Периодический опрос состояния комнаты
  startPolling(roomCode, callback, interval = 2000) {
    if (this._pollingInterval) {
      clearInterval(this._pollingInterval);
    }

    this._pollingInterval = setInterval(async () => {
      try {
        const state = await this.getRoomState(roomCode);
        if (state && typeof callback === 'function') {
          callback(state);
        } else if (!state) {
          console.warn('Получен пустой ответ от сервера');
          if (typeof callback === 'function') {
            callback({ players: [], gameStarted: false });
          }
        }
      } catch (error) {
        console.error('Ошибка при получении обновлений комнаты:', error);
        // При ошибке отправляем пустое состояние
        if (typeof callback === 'function') {
          callback({ players: [], gameStarted: false });
        }
      }
    }, interval);
  }

  // Остановка опроса
  stopPolling() {
    if (this._pollingInterval) {
      clearInterval(this._pollingInterval);
      this._pollingInterval = null;
    }
  }
}

// Экспортируем синглтон
export default new GameApi(); 