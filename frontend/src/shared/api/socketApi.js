import { io } from 'socket.io-client';
import mediasoupApi from './mediasoupApi';

class SocketApi {
  constructor() {
    this.socket = null;
    this.socketId = null;
    this.connected = false;
    this.listeners = new Map();
    this.serverUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002';
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 5;
  }

  // Инициализация сокета
  init(serverUrl = null) {
    if (this.socket && this.connected) {
      console.log('Сокет уже подключен');
      return this.socket;
    }
    
    // Если передан URL, используем его
    if (serverUrl) {
      this.serverUrl = serverUrl;
    }
    
    console.log('Инициализация сокета, подключение к:', this.serverUrl);
    
    // Проверка доступности сервера перед подключением
    this.checkServerAvailability()
      .then(available => {
        if (!available) {
          console.warn('Предварительная проверка показала, что сервер недоступен');
        }
      })
      .catch(err => {
        console.error('Ошибка при проверке доступности сервера:', err);
      });
    
    // Создаем новое подключение
    try {
      // Если есть существующее соединение, закрываем его
      if (this.socket) {
        console.log('Закрываем существующий сокет');
        this.socket.disconnect();
        this.socket = null;
      }
      
      // Создаем новый сокет
      this.socket = io(this.serverUrl, {
        transports: ['websocket', 'polling'],
        timeout: 10000,
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        autoConnect: true,
        path: '/socket.io/',
        forceNew: true,
        multiplex: false,
        upgrade: true,
        rememberUpgrade: true,
        secure: false,
        rejectUnauthorized: false
      });
      
      // Обработка событий соединения
      this.socket.on('connect', () => {
        console.log('Сокет подключен, ID:', this.socket.id);
        this.connected = true;
        this.socketId = this.socket.id;
        this.connectionAttempts = 0;
      });
      
      this.socket.on('connect_error', (error) => {
        console.error('Ошибка подключения:', error);
        this.connected = false;
        this.connectionAttempts++;
        
        if (this.connectionAttempts <= this.maxConnectionAttempts) {
          console.log(`Повторная попытка подключения ${this.connectionAttempts} из ${this.maxConnectionAttempts}...`);
        } else {
          console.error('Превышено максимальное количество попыток подключения');
          // Здесь можно добавить код для отображения сообщения пользователю
          alert('Ошибка подключения к серверу. Пожалуйста, убедитесь, что сервер запущен и обновите страницу.');
        }
      });
      
      this.socket.on('disconnect', (reason) => {
        console.log('Сокет отключен, причина:', reason);
        this.connected = false;
      });
      
      this.socket.on('reconnect', (attemptNumber) => {
        console.log('Повторное подключение установлено, попытка #', attemptNumber);
        this.connected = true;
      });
      
      this.socket.on('reconnect_error', (error) => {
        console.error('Ошибка повторного подключения:', error);
      });
      
      this.socket.on('reconnect_failed', () => {
        console.error('Все попытки повторного подключения не удались');
      });
      
      // Обработка обновлений комнаты
      this.socket.on('room-updated', (data) => {
        console.log('Получено обновление комнаты:', data);
      });
      
      // Обработка запросов видео соединения
      this.socket.on('player-joined-video', ({ roomId, playerId }) => {
        console.log('Получен запрос на видео соединение от:', playerId, 'для комнаты:', roomId);
        // Эмитим событие присоединения для нашего videoApi
        this.socket.emit('player-joined', playerId);
      });
      
      // Обработка сигналов WebRTC
      this.socket.on('signal', ({ from, signal }) => {
        console.log('Получен WebRTC сигнал от:', from);
        this.trigger('signal', { from, signal });
      });
      
      // Получение списка всех игроков в комнате
      this.socket.on('all-players', (players) => {
        console.log('Получен список всех игроков в комнате:', players);
        this.trigger('all-players', players);
      });
      
      // Обработка WebRTC сигналов
      this.socket.on('webrtc-offer', async ({ offer, from }) => {
        console.log('Получено предложение WebRTC от:', from);
        try {
          const answer = await mediasoupApi.handleOffer(from, offer);
          console.log('Отправка ответа WebRTC к:', from);
          this.socket.emit('webrtc-answer', { answer, to: from });
        } catch (error) {
          console.error('Ошибка обработки предложения WebRTC:', error);
          // Отправляем уведомление об ошибке
          this.socket.emit('webrtc-error', { 
            to: from, 
            error: 'Не удалось установить соединение' 
          });
        }
      });

      this.socket.on('webrtc-answer', async ({ answer, from }) => {
        console.log('Получен ответ WebRTC от:', from);
        try {
          await mediasoupApi.handleAnswer(from, answer);
          console.log('Ответ WebRTC успешно обработан от:', from);
        } catch (error) {
          console.error('Ошибка обработки ответа WebRTC:', error);
          // Отправляем уведомление об ошибке
          this.socket.emit('webrtc-error', { 
            to: from, 
            error: 'Не удалось установить соединение' 
          });
        }
      });

      this.socket.on('webrtc-ice-candidate', async ({ candidate, from }) => {
        console.log('Получен ICE кандидат от:', from);
        try {
          await mediasoupApi.handleIceCandidate(from, candidate);
          console.log('ICE кандидат успешно обработан от:', from);
        } catch (error) {
          console.error('Ошибка обработки ICE кандидата:', error);
        }
      });

      this.socket.on('webrtc-error', ({ error, from }) => {
        console.error('Получена ошибка WebRTC от:', from, error);
        // Здесь можно добавить обработку ошибок на уровне UI
      });
    } catch (error) {
      console.error('Ошибка при создании сокета:', error);
      alert('Не удалось подключиться к серверу. Пожалуйста, проверьте соединение и обновите страницу.');
    }
    
    return this.socket;
  }

  // Метод для проверки доступности сервера
  async checkServerAvailability() {
    try {
      console.log('Проверка доступности сервера:', this.serverUrl);
      
      // Сначала проверяем, есть ли уже соединение
      if (this.connected && this.socket) {
        console.log('Соединение уже установлено, сервер доступен');
        return true;
      }
      
      // Устанавливаем таймаут для проверки
      const timeout = 3000; // 3 секунды
      
      try {
        // Простое подключение через Socket.IO для проверки
        return new Promise((resolve) => {
          // Создаем временное соединение для проверки
          const testSocket = io(this.serverUrl, {
            transports: ['websocket', 'polling'],
            timeout: timeout,
            reconnection: false,
            forceNew: true
          });
          
          // Установим таймаут для соединения
          const connectionTimeout = setTimeout(() => {
            console.warn('Таймаут проверки соединения');
            testSocket.disconnect();
            resolve(false);
          }, timeout);
          
          testSocket.on('connect', () => {
            console.log('Тестовое соединение установлено');
            clearTimeout(connectionTimeout);
            testSocket.disconnect();
            resolve(true);
          });
          
          testSocket.on('connect_error', (error) => {
            console.warn('Ошибка тестового соединения:', error);
            clearTimeout(connectionTimeout);
            testSocket.disconnect();
            resolve(false);
          });
        });
      } catch (error) {
        console.error('Ошибка при проверке доступности сервера:', error);
        return false;
      }
    } catch (error) {
      console.error('Общая ошибка при проверке доступности сервера:', error);
      return false;
    }
  }

  // Создание комнаты
  createRoom(playerName) {
    if (!this.connected || !this.socket) {
      console.warn('Попытка создать комнату, но соединение не установлено');
      return false;
    }

    this.socket.emit('create-room', { playerName });
    return true;
  }

  // Присоединение к комнате
  joinRoom(roomCode, playerName) {
    if (!this.connected || !this.socket) {
      console.warn('Попытка присоединиться к комнате, но соединение не установлено');
      return false;
    }

    this.socket.emit('join-room', { roomCode, playerName });
    return true;
  }

  // Начало игры
  startGame(roomCode) {
    if (!this.connected || !this.socket) {
      console.warn('Попытка начать игру, но соединение не установлено');
      return false;
    }

    this.socket.emit('start-game', { roomCode });
    return true;
  }

  // Обновление статуса видео
  updateVideoStatus(roomCode, enabled) {
    if (!this.connected || !this.socket) {
      console.warn('Попытка обновить статус видео, но соединение не установлено');
      return;
    }

    console.log(`Отправка статуса видео: комната ${roomCode}, включено: ${enabled}`);
    this.socket.emit('video-status', { roomCode, enabled });
  }

  // Установка персонажа для игрока
  setCharacter(roomCode, targetPlayerId, character) {
    if (!this.connected || !this.socket) {
      console.warn('Попытка установить персонажа, но соединение не установлено');
      return false;
    }

    this.socket.emit('set-character', { roomCode, targetPlayerId, character });
    return true;
  }

  // Добавление слушателя события
  on(event, callback) {
    if (!this.socket) {
      this.init();
    }

    // Сохраняем ссылку на обработчик, чтобы можно было удалить его позже
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);

    this.socket.on(event, callback);
  }

  // Удаление слушателя события
  off(event, callback) {
    if (!this.socket) {
      return;
    }

    if (callback) {
      this.socket.off(event, callback);
      
      // Удаляем конкретный обработчик из списка
      const callbacks = this.listeners.get(event) || [];
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
      }
    } else {
      // Удаляем все обработчики для события
      const callbacks = this.listeners.get(event) || [];
      callbacks.forEach(cb => {
        this.socket.off(event, cb);
      });
      this.listeners.delete(event);
    }
  }

  // Удаление всех слушателей
  removeAllListeners() {
    if (!this.socket) {
      return;
    }

    this.listeners.forEach((callbacks, event) => {
      callbacks.forEach(callback => {
        this.socket.off(event, callback);
      });
    });

    this.listeners.clear();
  }

  // Проверка соединения
  isConnected() {
    return this.connected;
  }

  // Получить ID сокета (ID игрока)
  getSocketId() {
    return this.socket?.id;
  }

  // Отключение
  disconnect() {
    if (!this.socket) {
      return;
    }

    mediasoupApi.stopAllConnections();
    mediasoupApi.stopLocalStream();
    this.socket.disconnect();
    this.socket = null;
    this.connected = false;
    this.socketId = null;
    this.listeners.clear();
  }

  // Выход из комнаты
  leaveRoom(roomCode) {
    if (!this.connected || !this.socket) {
      return;
    }

    this.socket.emit('leave-room', { roomCode });
  }

  // Получение списка игроков в комнате
  getPlayers(roomCode) {
    if (!this.connected || !this.socket) {
      console.warn('Попытка получить список игроков, но соединение не установлено');
      return false;
    }
    
    this.socket.emit('get-players', { roomCode });
    return true;
  }

  // Добавляем базовую функцию для отправки сообщений на сервер
  emit(eventName, data) {
    if (!this.connected || !this.socket) {
      console.warn(`Попытка отправить событие ${eventName}, но соединение не установлено`);
      return false;
    }
    
    this.socket.emit(eventName, data);
    return true;
  }

  // Метод для вызова обработчиков событий
  trigger(event, data) {
    if (!this.listeners.has(event)) return;
    
    const callbacks = this.listeners.get(event) || [];
    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Ошибка в обработчике события ${event}:`, error);
      }
    });
  }

  // Методы для WebRTC
  async initiateWebRTCConnection(targetId) {
    try {
      const offer = await mediasoupApi.createOffer(targetId);
      this.socket.emit('webrtc-offer', { offer, to: targetId });
    } catch (error) {
      console.error('Ошибка инициализации WebRTC соединения:', error);
    }
  }

  // Обработка подключения нового игрока
  onPlayerJoined(callback) {
    this.socket.on('player-joined', async (data) => {
      console.log('Новый игрок присоединился:', data);
      try {
        // Инициируем WebRTC соединение с новым игроком
        await this.initiateWebRTCConnection(data.playerId);
        console.log('WebRTC соединение инициировано с:', data.playerId);
        callback(data);
      } catch (error) {
        console.error('Ошибка инициализации WebRTC соединения:', error);
      }
    });
  }

  // Обработка отключения игрока
  onPlayerLeft(callback) {
    this.socket.on('player-left', (data) => {
      console.log('Игрок покинул комнату:', data);
      // Закрываем WebRTC соединение
      mediasoupApi.closeConnection(data.playerId);
      console.log('WebRTC соединение закрыто с:', data.playerId);
      callback(data);
    });
  }

  // Отправка WebRTC предложения
  sendWebRTCOffer(peerId, offer) {
    if (!this.socket || !this.connected) {
      console.error('Сокет не подключен');
      return;
    }
    console.log('Отправка предложения WebRTC к:', peerId);
    this.socket.emit('webrtc-offer', {
      to: peerId,
      offer
    });
  }

  // Отправка WebRTC ответа
  sendWebRTCAnswer(peerId, answer) {
    if (!this.socket || !this.connected) {
      console.error('Сокет не подключен');
      return;
    }
    console.log('Отправка ответа WebRTC к:', peerId);
    this.socket.emit('webrtc-answer', {
      to: peerId,
      answer
    });
  }

  // Отправка WebRTC ICE кандидата
  sendWebRTCIceCandidate(peerId, candidate) {
    if (!this.socket || !this.connected) {
      console.error('Сокет не подключен');
      return;
    }
    console.log('Отправка ICE кандидата к:', peerId);
    this.socket.emit('webrtc-ice-candidate', {
      to: peerId,
      candidate
    });
  }

  // Получение WebRTC предложения
  onWebRTCOffer(callback) {
    this.socket.on('webrtc-offer', async ({ from, offer }) => {
      try {
        const peerConnection = await mediasoupApi.createPeerConnection(from);
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        this.sendWebRTCAnswer(from, answer);
      } catch (error) {
        console.error('Ошибка при обработке WebRTC предложения:', error);
      }
    });
  }

  // Получение WebRTC ответа
  onWebRTCAnswer(callback) {
    this.socket.on('webrtc-answer', async ({ from, answer }) => {
      try {
        const peerConnection = mediasoupApi.getPeerConnection(from);
        if (peerConnection) {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        }
      } catch (error) {
        console.error('Ошибка при обработке WebRTC ответа:', error);
      }
    });
  }

  // Получение WebRTC ICE кандидата
  onWebRTCIceCandidate(callback) {
    this.socket.on('webrtc-ice-candidate', async ({ from, candidate }) => {
      try {
        const peerConnection = mediasoupApi.getPeerConnection(from);
        if (peerConnection) {
          await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (error) {
        console.error('Ошибка при обработке WebRTC ICE кандидата:', error);
      }
    });
  }

  // Отключение WebRTC обработчиков
  offWebRTCOffer(callback) {
    if (!this.socket) return;
    this.socket.off('webrtc-offer', callback);
  }

  offWebRTCAnswer(callback) {
    if (!this.socket) return;
    this.socket.off('webrtc-answer', callback);
  }

  offWebRTCIceCandidate(callback) {
    if (!this.socket) return;
    this.socket.off('webrtc-ice-candidate', callback);
  }

  offPlayerJoined(callback) {
    if (!this.socket) return;
    this.socket.off('player-joined', callback);
  }

  // Получение текущего состояния сокета
  getSocketState() {
    if (!this.socket) {
      return {
        connected: false,
        connectionState: 'closed',
        id: null,
        transportType: null
      };
    }
    
    return {
      connected: this.socket.connected,
      connectionState: this.socket.connected ? 'connected' : (this.socket.disconnected ? 'disconnected' : 'connecting'),
      id: this.socket.id,
      transportType: this.socket.io?.engine?.transport?.name || null
    };
  }
  
  // Преобразование объекта с состоянием сокета в строку для вывода в консоль
  getSocketStateString() {
    const state = this.getSocketState();
    return `Сокет: ${state.connectionState} (ID: ${state.id || 'нет'}, транспорт: ${state.transportType || 'неизвестно'})`;
  }
  
  // Логирование состояния сокета в консоль
  logSocketState() {
    console.log(this.getSocketStateString());
    return this.getSocketState();
  }
}

// Экспортируем синглтон
export default new SocketApi(); 