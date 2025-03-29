// Проверка, определены ли уже глобальные объекты
if (typeof global === 'undefined') {
  window.global = window;
}

if (typeof process === 'undefined' || !process.browser) {
  window.process = window.process || {};
  window.process.browser = true;
  window.process.env = window.process.env || {};
}

if (typeof Buffer === 'undefined') {
  window.Buffer = window.Buffer || {
    from: (arr) => new Uint8Array(arr),
    alloc: (size) => new Uint8Array(size),
    allocUnsafe: (size) => new Uint8Array(size),
    isBuffer: () => false
  };
}

import socketApi from './socketApi';
import Peer from 'simple-peer';

// Реализация VideoApi с использованием WebRTC и simple-peer
class VideoApi {
  constructor() {
    this.peers = {};
    this.connectedPlayers = new Set();
    this.localStream = null;
    this.onRemoteStream = null;
    this.onRemoteStreamRemoved = null;
    this.myPlayerId = null;
    this.roomId = null;
    this.initialized = false;
    this.animationFrames = [];
    this.canvasStreams = {};
  }

  // Создание WebRTC пира
  createPeer(playerId, initiator, initialSignal = null) {
    console.log(`Создание WebRTC соединения с ${playerId} (инициатор: ${initiator})`);
    
    if (this.peers[playerId]) {
      console.log(`Соединение с ${playerId} уже существует`);
      return;
    }

    const options = {
      initiator,
      trickle: false,
      stream: this.localStream,
      config: {
        iceServers: [
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' },
          { urls: 'stun:stun5.l.google.com:19302' },
          { urls: 'stun:stun6.l.google.com:19302' },
          { urls: 'stun:stun7.l.google.com:19302' },
          { urls: 'stun:stun8.l.google.com:19302' },
          { urls: 'stun:stun9.l.google.com:19302' },
          { urls: 'stun:stun10.l.google.com:19302' },
          { urls: 'stun:stun11.l.google.com:19302' },
          { urls: 'stun:stun12.l.google.com:19302' },
          { urls: 'stun:stun13.l.google.com:19302' },
          { urls: 'stun:stun14.l.google.com:19302' },
          { urls: 'stun:stun15.l.google.com:19302' },
          { urls: 'stun:stun16.l.google.com:19302' },
          { urls: 'stun:stun17.l.google.com:19302' },
          { urls: 'stun:stun18.l.google.com:19302' },
          { urls: 'stun:stun19.l.google.com:19302' },
          { urls: 'stun:stun20.l.google.com:19302' }
        ],
        iceTransportPolicy: 'all',
        iceCandidatePoolSize: 10
      }
    };
    
    try {
      const peer = new Peer(options);
      
      peer.on('error', (err) => {
        console.error(`Ошибка в соединении с ${playerId}:`, err);
        this.handlePeerError(playerId, err);
      });

      peer.on('connect', () => {
        console.log(`Соединение установлено с ${playerId}`);
        this.connectedPlayers.add(playerId);
        
        // Проверяем состояние потока после установки соединения
        if (this.localStream) {
          const videoTrack = this.localStream.getVideoTracks()[0];
          if (videoTrack) {
            console.log(`Состояние видеотрека для ${playerId}:`, {
              enabled: videoTrack.enabled,
              readyState: videoTrack.readyState,
              muted: videoTrack.muted
            });
          }
        }
      });

      peer.on('close', () => {
        console.log(`Соединение закрыто с ${playerId}`);
        this.handlePeerClose(playerId);
      });

      peer.on('stream', (stream) => {
        console.log(`Получен поток от ${playerId}`);
        if (this.onRemoteStream) {
          stream.playerId = playerId;
          
          // Проверяем состояние полученного потока
          const videoTrack = stream.getVideoTracks()[0];
          if (videoTrack) {
            console.log(`Состояние полученного видеотрека от ${playerId}:`, {
              enabled: videoTrack.enabled,
              readyState: videoTrack.readyState,
              muted: videoTrack.muted
            });
          }
          
          this.onRemoteStream(playerId, stream);
        }
      });

      peer.on('signal', (signal) => {
        console.log(`Отправка сигнала к ${playerId}`);
        socketApi.emit('signal', { to: playerId, signal });
      });

      if (!initiator && initialSignal) {
        peer.signal(initialSignal);
      }

      this.peers[playerId] = peer;
      return peer;
    } catch (error) {
      console.error(`Ошибка при создании пира для ${playerId}:`, error);
      this.handlePeerError(playerId, error);
    }
  }

  // Обработка ошибок пира
  handlePeerError(playerId, error) {
    if (this.peers[playerId]) {
      this.peers[playerId].destroy();
      delete this.peers[playerId];
    }
    this.connectedPlayers.delete(playerId);
    
    if (this.onRemoteStreamRemoved) {
      this.onRemoteStreamRemoved(playerId);
    }
  }

  // Обработка закрытия пира
  handlePeerClose(playerId) {
    delete this.peers[playerId];
    this.connectedPlayers.delete(playerId);
    
    if (this.onRemoteStreamRemoved) {
      this.onRemoteStreamRemoved(playerId);
    }
  }

  // Создание потока из канваса
  async createCanvasStream() {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    
    let hue = 0;
    const text = 'Нет камеры';
    
    // Настройка анимации
    const animate = () => {
      // Очистка канваса
      ctx.fillStyle = '#1a1625';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Рисуем пульсирующую рамку
      const borderWidth = 4;
      ctx.strokeStyle = `hsl(${hue}, 70%, 60%)`;
      ctx.lineWidth = borderWidth;
      ctx.strokeRect(borderWidth/2, borderWidth/2, 
                    canvas.width - borderWidth, 
                    canvas.height - borderWidth);
      
      // Обновляем цвет
      hue = (hue + 1) % 360;
      
      // Рисуем текст
      ctx.font = '48px Arial';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, canvas.width/2, canvas.height/2);
      
      // Рисуем иконку камеры
      ctx.font = '36px Arial';
      ctx.fillText('🎥', canvas.width/2, canvas.height/2 - 60);
      
      const animFrameId = requestAnimationFrame(animate);
      this.animationFrames.push(animFrameId);
    };
    
    animate();
    
    const stream = canvas.captureStream(30);
    stream.isCanvasStream = true;
    return stream;
  }

  // Настройка слушателей сокетов и WebRTC соединений
  setupSocketListeners(roomId) {
    // Отписываемся от предыдущих слушателей
    socketApi.off('signal');
    socketApi.off('player-joined');
    socketApi.off('player-left');
    socketApi.off('all-players');
    
    // Отправляем запрос на присоединение к комнате
    socketApi.emit('join-room', { roomId });
    
    // Получаем список всех игроков в комнате и создаем соединения
    socketApi.on('all-players', (players) => {
      console.log('Получен список игроков в комнате:', players);
      players.forEach(playerId => {
        if (playerId !== this.myPlayerId && !this.connectedPlayers.has(playerId)) {
          console.log(`Создаем соединение с игроком ${playerId}`);
          this.createPeer(playerId, true);
        }
      });
    });
    
    // Обработка нового игрока
    socketApi.on('player-joined', (playerId) => {
      console.log('Новый игрок присоединился:', playerId);
      if (playerId !== this.myPlayerId && !this.connectedPlayers.has(playerId)) {
        console.log(`Создаем соединение с новым игроком ${playerId}`);
        this.createPeer(playerId, false);
      }
    });
    
    // Обработка выхода игрока
    socketApi.on('player-left', (playerId) => {
      console.log('Игрок вышел:', playerId);
      this.connectedPlayers.delete(playerId);
      
      // Закрываем соединение
      if (this.peers[playerId]) {
        this.peers[playerId].destroy();
        delete this.peers[playerId];
      }
      
      // Уведомляем об удалении потока
      if (this.onRemoteStreamRemoved) {
        this.onRemoteStreamRemoved(playerId);
      }
    });
    
    // Обработка WebRTC сигналов
    socketApi.on('signal', ({ from, signal }) => {
      console.log('Получен сигнал от:', from);
      
      // Если у нас уже есть соединение с этим игроком
      if (this.peers[from]) {
        if (this.peers[from].connected) {
          try {
            console.log(`Обработка сигнала для существующего соединения с ${from}`);
            this.peers[from].signal(signal);
          } catch (err) {
            console.error('Ошибка при обработке сигнала:', err);
            // Пересоздаем пир при ошибке
            this.handlePeerError(from, err);
            this.createPeer(from, false, signal);
          }
        } else {
          console.warn('Соединение с', from, 'не установлено или закрыто. Создаём новое соединение.');
          this.createPeer(from, false, signal);
        }
      } else {
        console.warn('Соединение с', from, 'не найдено. Создаём новое соединение.');
        this.createPeer(from, false, signal);
      }
    });
  }
  
  // Отключение видео
  toggleVideo(enabled) {
    if (this.localStream) {
      const videoTracks = this.localStream.getVideoTracks();
      if (videoTracks.length > 0) {
        videoTracks.forEach(track => {
          track.enabled = enabled;
        });
        return true;
      }
    }
    return false;
  }

  // Отключение звука
  toggleAudio(enabled) {
    if (this.localStream) {
      const audioTracks = this.localStream.getAudioTracks();
      if (audioTracks.length > 0) {
        audioTracks.forEach(track => {
          track.enabled = enabled;
        });
        return true;
      }
    }
    return false;
  }

  // Проверка статуса камеры
  isVideoEnabled() {
    return this.localStream && this.localStream.getVideoTracks().length > 0;
  }

  // Проверка статуса микрофона
  isAudioEnabled() {
    return this.localStream && this.localStream.getAudioTracks().length > 0;
  }

  // Остановка всех соединений
  stop() {
    // Останавливаем локальный поток
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    
    // Закрываем все WebRTC соединения
    Object.values(this.peers).forEach(peer => {
      if (peer && typeof peer.destroy === 'function') {
        peer.destroy();
      }
    });
    this.peers = {};
    
    // Очищаем все подписки
    socketApi.off('signal');
    socketApi.off('player-joined');
    socketApi.off('player-left');
    socketApi.off('all-players');
    
    // Остановка всех анимаций
    this.animationFrames.forEach(id => {
      cancelAnimationFrame(id);
    });
    this.animationFrames = [];
    
    // Удаление canvas элементов
    const canvasElements = document.querySelectorAll('canvas[id^="canvas-"]');
    canvasElements.forEach(canvas => {
      canvas.remove();
    });
    
    // Очищаем сохраненные потоки
    this.canvasStreams = {};
    
    // Сбрасываем состояние
    this.initialized = false;
    this.connectedPlayers.clear();
    this.roomId = null;
  }
  
  // Получение информации о потоке
  getStreamInfo(stream) {
    if (!stream) return null;
    
    return {
      isCanvas: stream.isCanvasStream || false,
      canvasId: stream.canvasId || null,
      videoTracks: stream.getVideoTracks().length,
      audioTracks: stream.getAudioTracks().length
    };
  }

  // Инициализация API
  async init(roomId) {
    console.log('Инициализация Video API с WebRTC для комнаты:', roomId);
    this.roomId = roomId;
    
    // Сначала освобождаем предыдущие ресурсы
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        console.log(`Попытка ${retryCount + 1}/${maxRetries} получить видеопоток с камеры...`);
        
        // Запрашиваем только видео, если аудио не нужен
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30 }
          },
          audio: false // Отключаем аудио, так как оно не используется
        });
        
        console.log('Медиапоток получен успешно: видео треков:', stream.getVideoTracks().length, 
                    ', аудио треков:', stream.getAudioTracks().length);
        
        const videoTrack = stream.getVideoTracks()[0];
        console.log('Параметры видеотрека:', videoTrack.getSettings());
        
        this.localStream = stream;
        break;
      } catch (error) {
        console.error(`Попытка ${retryCount + 1}/${maxRetries} не удалась:`, error);
        
        if (error.name === 'NotReadableError' && retryCount < maxRetries - 1) {
          console.log('Устройство занято, ждем 2 секунды перед следующей попыткой...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          retryCount++;
          continue;
        }
        
        console.error('Не удалось получить видеопоток с камеры:', error);
        console.log('Создаем поток из канваса вместо камеры');
        this.localStream = await this.createCanvasStream();
        break;
      }
    }

    this.initialized = true;
    return this.localStream;
  }
}

const videoApi = new VideoApi();
export default videoApi; 