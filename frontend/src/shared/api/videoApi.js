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
    this.signalListenersSet = false;
  }

  // Создание WebRTC пира
  createPeer(playerId, initiator, initialSignal = null) {
    console.log(`Создание WebRTC соединения с ${playerId} (инициатор: ${initiator})`);
    
    if (this.peers[playerId]) {
      console.log(`Соединение с ${playerId} уже существует. Уничтожаем старое соединение.`);
      this.peers[playerId].destroy();
      delete this.peers[playerId];
    }

    const options = {
      initiator,
      trickle: true,
      config: {
        iceServers: [
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { 
            urls: 'turn:numb.viagenie.ca',
            username: 'webrtc@live.com',
            credential: 'muazkh'
          }
        ],
        iceTransportPolicy: 'all',
        iceCandidatePoolSize: 10
      },
      objectMode: false,
      sdpTransform: (sdp) => {
        // Приоритет для видео
        return sdp.replace('a=group:BUNDLE 0 1\r\n', 'a=group:BUNDLE 1 0\r\n');
      }
    };
    
    // Добавляем медиапоток, если он есть
    if (this.localStream) {
      options.stream = this.localStream;
      
      // Логируем состояние треков
      const videoTracks = this.localStream.getVideoTracks();
      if (videoTracks.length > 0) {
        console.log(`Добавление локального видео в peer для ${playerId}. Статус трека:`, {
          enabled: videoTracks[0].enabled,
          readyState: videoTracks[0].readyState,
          muted: videoTracks[0].muted
        });
      } else {
        console.warn(`Нет видеотреков для добавления в peer для ${playerId}`);
      }
    } else {
      console.warn(`Создание peer без медиапотока для ${playerId}`);
    }
    
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
        
        // Отправляем пустые данные для поддержания соединения
        setInterval(() => {
          if (peer && !peer.destroyed) {
            try {
              peer.send('ping');
            } catch (e) {
              console.error('Ошибка отправки ping:', e);
            }
          }
        }, 5000);
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
              muted: videoTrack.muted,
              settings: videoTrack.getSettings()
            });
          } else {
            console.warn(`Поток от ${playerId} не содержит видеотреков`);
          }
          
          this.onRemoteStream(playerId, stream);
        }
      });

      peer.on('signal', (signal) => {
        console.log(`Сигнал для отправки к ${playerId}`);
        socketApi.emit('signal', { to: playerId, signal });
      });

      if (!initiator && initialSignal) {
        console.log(`Применение начального сигнала для ${playerId}`);
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
    console.error(`Ошибка пира для ${playerId}:`, error);
    
    if (this.peers[playerId]) {
      // Уничтожаем пир с ошибкой и создаем новый
      this.peers[playerId].destroy();
      delete this.peers[playerId];
      
      // Пробуем пересоздать соединение после небольшой задержки
      setTimeout(() => {
        if (!this.peers[playerId]) {
          console.log(`Пересоздание соединения с ${playerId} после ошибки`);
          this.createPeer(playerId, true);
        }
      }, 2000);
    }
    
    this.connectedPlayers.delete(playerId);
    
    if (this.onRemoteStreamRemoved) {
      this.onRemoteStreamRemoved(playerId);
    }
  }

  // Обработка закрытия пира
  handlePeerClose(playerId) {
    console.log(`Соединение закрыто с ${playerId}`);
    
    if (this.peers[playerId]) {
      this.peers[playerId].destroy();
      delete this.peers[playerId];
    }
    
    this.connectedPlayers.delete(playerId);
    
    if (this.onRemoteStreamRemoved) {
      this.onRemoteStreamRemoved(playerId);
    }
    
    // Пробуем пересоздать соединение после небольшой задержки
    setTimeout(() => {
      if (!this.peers[playerId]) {
        console.log(`Пересоздание соединения с ${playerId} после закрытия`);
        this.createPeer(playerId, true);
      }
    }, 2000);
  }

  // Настройка слушателей сокетов и WebRTC соединений
  setupSocketListeners(roomId, onRemoteStream, onRemoteStreamRemoved) {
    if (this.signalListenersSet) {
      console.log('Слушатели сигналов уже установлены');
      return;
    }
    
    this.onRemoteStream = onRemoteStream;
    this.onRemoteStreamRemoved = onRemoteStreamRemoved;
    this.roomId = roomId;
    this.myPlayerId = socketApi.getSocketId();
    
    console.log(`Настройка слушателей сокетов для комнаты ${roomId}, мой ID: ${this.myPlayerId}`);
    
    // Отписываемся от предыдущих слушателей
    socketApi.off('signal');
    socketApi.off('player-joined');
    socketApi.off('player-left');
    socketApi.off('all-players');
    
    // Обработка входящих сигналов WebRTC
    socketApi.on('signal', ({ from, signal }) => {
      console.log(`Получен сигнал от ${from}`);
      
      if (from === this.myPlayerId) {
        console.warn('Игнорируем сигнал от самого себя');
        return;
      }
      
      // Если пир не существует, создаем его
      if (!this.peers[from]) {
        console.log(`Создаем новый peer для ${from} на основе полученного сигнала`);
        this.createPeer(from, false, signal);
      } else {
        // Иначе применяем сигнал к существующему пиру
        console.log(`Применяем сигнал к существующему peer для ${from}`);
        this.peers[from].signal(signal);
      }
    });
    
    // Обработка нового игрока
    socketApi.on('player-joined', (playerId) => {
      console.log('Новый игрок присоединился:', playerId);
      
      if (playerId !== this.myPlayerId && !this.peers[playerId]) {
        console.log(`Создаем соединение с новым игроком ${playerId}`);
        // Используем setTimeout чтобы дать время серверу обработать присоединение
        setTimeout(() => {
          this.createPeer(playerId, true);
        }, 1000);
      }
    });
    
    // Получаем список всех игроков в комнате и создаем соединения
    socketApi.on('all-players', (players) => {
      console.log('Получен список игроков в комнате:', players);
      
      // Устанавливаем таймаут для постепенного создания соединений
      players.forEach((playerId, index) => {
        if (playerId !== this.myPlayerId && !this.peers[playerId]) {
          // Создаем соединения с задержкой, чтобы не перегрузить систему
          setTimeout(() => {
            console.log(`Создаем соединение с игроком ${playerId} из списка`);
            this.createPeer(playerId, true);
          }, 500 * index); // Добавляем задержку для каждого следующего игрока
        }
      });
    });
    
    // Обработка выхода игрока
    socketApi.on('player-left', (playerId) => {
      console.log('Игрок вышел:', playerId);
      
      if (this.peers[playerId]) {
        console.log(`Удаляем соединение с игроком ${playerId}`);
        this.peers[playerId].destroy();
        delete this.peers[playerId];
        
        if (this.onRemoteStreamRemoved) {
          this.onRemoteStreamRemoved(playerId);
        }
      }
      
      this.connectedPlayers.delete(playerId);
    });
    
    this.signalListenersSet = true;
  }

  // Включение/выключение видео
  toggleVideo(enabled) {
    if (this.localStream) {
      const videoTracks = this.localStream.getVideoTracks();
      videoTracks.forEach(track => {
        track.enabled = enabled;
        console.log(`Видео ${enabled ? 'включено' : 'выключено'}`);
      });
      
      // Обновляем потоки в существующих соединениях
      this.updateMediaTracksInAllPeers();
      
      return enabled;
    }
    return false;
  }

  // Включение/выключение аудио
  toggleAudio(enabled) {
    if (this.localStream) {
      const audioTracks = this.localStream.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = enabled;
        console.log(`Аудио ${enabled ? 'включено' : 'выключено'}`);
      });
      
      // Обновляем потоки в существующих соединениях
      this.updateMediaTracksInAllPeers();
      
      return enabled;
    }
    return false;
  }
  
  // Обновление медиатреков во всех соединениях
  updateMediaTracksInAllPeers() {
    if (!this.localStream) return;
    
    Object.entries(this.peers).forEach(([playerId, peer]) => {
      if (peer && !peer.destroyed) {
        try {
          console.log(`Обновление медиатреков для ${playerId}`);
          
          // Добавляем или заменяем треки в соединении
          this.localStream.getTracks().forEach(track => {
            try {
              const sender = peer._senders.find(s => s.track && s.track.kind === track.kind);
              if (sender) {
                console.log(`Заменяем ${track.kind} трек для ${playerId}`);
                sender.replaceTrack(track).catch(err => {
                  console.error(`Ошибка при замене трека: ${err.message}`);
                });
              } else {
                console.log(`Добавляем ${track.kind} трек для ${playerId}`);
                peer.addTrack(track, this.localStream);
              }
            } catch (error) {
              console.error(`Ошибка при обновлении трека ${track.kind}:`, error);
            }
          });
        } catch (error) {
          console.error(`Ошибка при обновлении треков для ${playerId}:`, error);
        }
      }
    });
  }

  isVideoEnabled() {
    if (!this.localStream) return false;
    const videoTrack = this.localStream.getVideoTracks()[0];
    return videoTrack && videoTrack.enabled;
  }

  isAudioEnabled() {
    if (!this.localStream) return false;
    const audioTrack = this.localStream.getAudioTracks()[0];
    return audioTrack && audioTrack.enabled;
  }

  // Остановка всех соединений и освобождение ресурсов
  stop() {
    console.log('Остановка видео API');
    
    // Останавливаем все анимации холста
    this.animationFrames.forEach(id => cancelAnimationFrame(id));
    this.animationFrames = [];
    
    // Закрываем все WebRTC соединения
    Object.values(this.peers).forEach(peer => {
      try {
        if (peer && !peer.destroyed) {
          peer.destroy();
        }
      } catch (error) {
        console.error('Ошибка при удалении пира:', error);
      }
    });
    this.peers = {};
    
    // Останавливаем все треки локального потока
    if (this.localStream) {
      try {
        this.localStream.getTracks().forEach(track => {
          try {
            track.stop();
          } catch (error) {
            console.error('Ошибка при остановке трека:', error);
          }
        });
        this.localStream = null;
      } catch (error) {
        console.error('Ошибка при остановке локального потока:', error);
      }
    }
    
    // Останавливаем все потоки канваса
    Object.values(this.canvasStreams).forEach(stream => {
      try {
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
      } catch (error) {
        console.error('Ошибка при остановке потока канваса:', error);
      }
    });
    this.canvasStreams = {};
    
    // Отписываемся от всех событий сокетов
    socketApi.off('signal');
    socketApi.off('player-joined');
    socketApi.off('player-left');
    socketApi.off('all-players');
    
    this.connectedPlayers.clear();
    this.myPlayerId = null;
    this.roomId = null;
    this.initialized = false;
    this.signalListenersSet = false;
    
    console.log('Видео API остановлен');
  }

  // Получение информации о потоке
  getStreamInfo(stream) {
    if (!stream) return 'Поток отсутствует';
    
    return {
      videoTracks: stream.getVideoTracks().length,
      audioTracks: stream.getAudioTracks().length,
      videoEnabled: stream.getVideoTracks().some(track => track.enabled),
      audioEnabled: stream.getAudioTracks().some(track => track.enabled),
      isCanvasStream: !!stream.isCanvasStream
    };
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

  // Инициализация видео API
  async init(roomId, onRemoteStream, onRemoteStreamRemoved) {
    console.log('Инициализация Video API с WebRTC для комнаты:', roomId);
    this.roomId = roomId;
    this.onRemoteStream = onRemoteStream;
    this.onRemoteStreamRemoved = onRemoteStreamRemoved;
    
    // Устанавливаем слушатели сокетов
    this.setupSocketListeners(roomId, onRemoteStream, onRemoteStreamRemoved);
    
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
        
        // Запрашиваем видео и аудио
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30 }
          },
          audio: true // Включаем аудио для полноценного WebRTC
        });
        
        console.log('Медиапоток получен успешно: видео треков:', stream.getVideoTracks().length, 
                    ', аудио треков:', stream.getAudioTracks().length);
        
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          console.log('Параметры видеотрека:', videoTrack.getSettings());
          
          // Проверяем, что видеотрек активен
          if (!videoTrack.enabled) {
            videoTrack.enabled = true;
          }
        }
        
        this.localStream = stream;
        
        // Создаем соединения с другими игроками
        this.myPlayerId = socketApi.getSocketId();
        console.log('Мой ID игрока:', this.myPlayerId);
        
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
        
        try {
          this.localStream = await this.createCanvasStream();
          console.log('Создан резервный поток из канваса:', this.getStreamInfo(this.localStream));
        } catch (canvasError) {
          console.error('Не удалось создать даже резервный поток:', canvasError);
          // Создаем пустые треки для сохранения соединения
          const emptyAudioTrack = this.createEmptyAudioTrack();
          const emptyVideoTrack = this.createEmptyVideoTrack();
          this.localStream = new MediaStream([emptyAudioTrack, emptyVideoTrack]);
          console.log('Создан пустой медиапоток');
        }
        break;
      }
    }

    this.initialized = true;
    return this.localStream;
  }
  
  // Создание пустого аудио трека
  createEmptyAudioTrack() {
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const dst = oscillator.connect(ctx.createMediaStreamDestination());
    oscillator.start();
    const track = dst.stream.getAudioTracks()[0];
    track.enabled = false;
    return track;
  }
  
  // Создание пустого видео трека
  createEmptyVideoTrack() {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    const stream = canvas.captureStream(5);
    const track = stream.getVideoTracks()[0];
    return track;
  }
}

const videoApi = new VideoApi();
export default videoApi; 