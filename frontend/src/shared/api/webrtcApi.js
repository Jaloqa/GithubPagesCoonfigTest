import socketApi from './socketApi';

class WebRTCApi {
  constructor() {
    this.localStream = null;
    this.peerConnections = new Map();
    this.onTrackCallback = null;
    this.maxRetries = 3;
    this.retryCount = 0;
    this.isInitializing = false;
    this.initializationPromise = null;
    this.deviceInUseRetries = 0;
    this.maxDeviceInUseRetries = 5;
  }

  // Конфигурация ICE серверов
  config = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:stun5.l.google.com:19302' },
      { urls: 'stun:stun6.l.google.com:19302' },
      { urls: 'stun:stun7.l.google.com:19302' },
      { urls: 'stun:stun8.l.google.com:19302' },
      { urls: 'stun:stun9.l.google.com:19302' },
      { urls: 'stun:stun10.l.google.com:19302' }
    ],
    iceTransportPolicy: 'all',
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
  };

  async initLocalStream() {
    // Если уже инициализируемся, возвращаем существующий промис
    if (this.isInitializing) {
      console.log('Инициализация уже выполняется, возвращаем существующий промис');
      return this.initializationPromise;
    }

    // Если поток уже существует, возвращаем его
    if (this.localStream) {
      console.log('Локальный поток уже существует');
      return this.localStream;
    }

    this.isInitializing = true;
    this.initializationPromise = (async () => {
      try {
        // Останавливаем существующий поток, если есть
        if (this.localStream) {
          console.log('Остановка локального потока');
          this.localStream.getTracks().forEach(track => {
            console.log('Трек остановлен:', track.kind);
            track.stop();
          });
        }

        // Ждем немного перед новой попыткой
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Запрашиваем доступ к медиа-устройствам
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30 }
          },
          audio: true
        });

        this.localStream = stream;
        this.retryCount = 0; // Сбрасываем счетчик попыток при успехе
        this.deviceInUseRetries = 0; // Сбрасываем счетчик попыток при ошибке устройства
        return stream;
      } catch (error) {
        console.error('Ошибка получения доступа к медиапотоку:', error);
        
        // Если ошибка "Device in use", пробуем еще раз с увеличенной задержкой
        if (error.name === 'NotReadableError' && this.deviceInUseRetries < this.maxDeviceInUseRetries) {
          this.deviceInUseRetries++;
          console.log(`Повторная попытка при ошибке "Device in use" ${this.deviceInUseRetries} из ${this.maxDeviceInUseRetries}`);
          
          // Увеличиваем задержку с каждой попыткой
          await new Promise(resolve => setTimeout(resolve, 2000 * this.deviceInUseRetries));
          this.isInitializing = false;
          this.initializationPromise = null;
          return this.initLocalStream();
        }
        
        // Если другая ошибка и есть еще попытки, пробуем снова
        if (this.retryCount < this.maxRetries) {
          this.retryCount++;
          console.log(`Повторная попытка ${this.retryCount} из ${this.maxRetries}`);
          
          // Увеличиваем задержку с каждой попыткой
          await new Promise(resolve => setTimeout(resolve, 1000 * this.retryCount));
          this.isInitializing = false;
          this.initializationPromise = null;
          return this.initLocalStream();
        }
        
        this.isInitializing = false;
        this.initializationPromise = null;
        throw error;
      }
    })();

    return this.initializationPromise;
  }

  async createPeerConnection(peerId) {
    // Если соединение уже существует, возвращаем его
    if (this.peerConnections.has(peerId)) {
      const existingConnection = this.peerConnections.get(peerId);
      if (existingConnection.connectionState !== 'closed') {
        console.log('Используем существующее соединение с:', peerId);
        return existingConnection;
      }
      // Если соединение закрыто, удаляем его
      console.log('Удаляем закрытое соединение с:', peerId);
      this.peerConnections.delete(peerId);
    }

    const peerConnection = new RTCPeerConnection(this.config);
    
    // Обработка ICE кандидатов
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('Отправка ICE кандидата:', event.candidate.type);
        socketApi.sendWebRTCIceCandidate(peerId, event.candidate);
      }
    };

    // Обработка изменения состояния соединения
    peerConnection.onconnectionstatechange = () => {
      console.log(`Состояние соединения с ${peerId}:`, peerConnection.connectionState);
      
      // Если соединение закрыто или не удалось установить, удаляем его
      if (peerConnection.connectionState === 'closed' || 
          peerConnection.connectionState === 'failed' ||
          peerConnection.connectionState === 'disconnected') {
        console.log(`Удаляем соединение с ${peerId} из-за состояния:`, peerConnection.connectionState);
        this.peerConnections.delete(peerId);
      }
    };

    // Обработка ошибок ICE
    peerConnection.oniceconnectionstatechange = () => {
      console.log(`Состояние ICE соединения с ${peerId}:`, peerConnection.iceConnectionState);
      if (peerConnection.iceConnectionState === 'failed') {
        console.log(`Перезапуск ICE для ${peerId}`);
        peerConnection.restartIce();
      }
    };

    // Обработка входящих треков
    peerConnection.ontrack = (event) => {
      console.log('Получен трек:', event.track.kind, 'от', peerId);
      if (this.onTrackCallback) {
        this.onTrackCallback(peerId, event);
      }
    };

    // Добавляем локальные треки, если они есть
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        console.log('Добавляем локальный трек:', track.kind);
        peerConnection.addTrack(track, this.localStream);
      });
    }

    this.peerConnections.set(peerId, peerConnection);
    return peerConnection;
  }

  getPeerConnection(peerId) {
    return this.peerConnections.get(peerId);
  }

  setOnTrackCallback(callback) {
    this.onTrackCallback = callback;
  }

  closeAllConnections() {
    this.peerConnections.forEach((connection, peerId) => {
      console.log(`Закрытие соединения с ${peerId}`);
      connection.close();
    });
    this.peerConnections.clear();
  }

  // Очистка ресурсов
  cleanup() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    this.closeAllConnections();
    this.isInitializing = false;
    this.initializationPromise = null;
    this.deviceInUseRetries = 0;
  }

  // Проверка доступности серверов STUN
  async checkStunServers() {
    try {
      console.log('Проверка доступности STUN серверов...');
      
      // Создаем временное соединение для проверки
      const pc = new RTCPeerConnection(this.config);
      
      // Создаем канал данных (требуется для генерации ICE кандидатов)
      pc.createDataChannel('probe');
      
      // Устанавливаем таймаут для проверки
      const checkPromise = new Promise((resolve, reject) => {
        let iceCandidatesFound = false;
        
        // Обработка ICE кандидатов
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            // Если получен не-локальный кандидат, серверы STUN доступны
            if (event.candidate.type !== 'host') {
              iceCandidatesFound = true;
              resolve(true);
            }
          } else if (event.candidate === null) {
            // Все кандидаты собраны
            if (!iceCandidatesFound) {
              reject(new Error('Не удалось получить публичные ICE кандидаты. Возможно, STUN серверы недоступны.'));
            }
          }
        };
        
        // Обработка ошибок ICE
        pc.onicecandidateerror = (event) => {
          console.error('Ошибка при сборе ICE кандидатов:', event);
        };
        
        // Таймаут для проверки
        setTimeout(() => {
          if (!iceCandidatesFound) {
            reject(new Error('Таймаут при проверке доступности STUN серверов.'));
          }
        }, 5000);
      });
      
      // Создаем предложение для запуска сбора ICE кандидатов
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      // Ожидаем результат проверки
      await checkPromise;
      
      // Закрываем временное соединение
      pc.close();
      
      console.log('STUN серверы доступны.');
      return true;
    } catch (error) {
      console.error('Ошибка при проверке доступности STUN серверов:', error);
      return false;
    }
  }

  // Метод для инициализации с проверкой сервера и STUN
  async initialize() {
    try {
      // Проверяем доступность STUN серверов
      const stunAvailable = await this.checkStunServers();
      if (!stunAvailable) {
        console.warn('STUN серверы недоступны. Соединения могут работать некорректно.');
      }
      
      // Инициализируем локальный поток
      const stream = await this.initLocalStream();
      return stream;
    } catch (error) {
      console.error('Ошибка при инициализации WebRTC:', error);
      throw error;
    }
  }

  // Создание соединения и отправка предложения
  async createOffer(peerId) {
    try {
      console.log('Создание предложения для:', peerId);
      
      // Ожидаем готовности локального потока
      if (!this.localStream) {
        console.log('Локальный поток отсутствует, инициализируем...');
        try {
          await this.initialize();
        } catch (error) {
          console.error('Ошибка при инициализации локального потока:', error);
          throw error;
        }
      }
      
      // Создаем и настраиваем соединение
      const peerConnection = await this.createPeerConnection(peerId);
      
      // Добавляем все треки из локального потока, если их еще нет
      const senders = peerConnection.getSenders();
      const hasVideoSender = senders.some(sender => sender.track && sender.track.kind === 'video');
      const hasAudioSender = senders.some(sender => sender.track && sender.track.kind === 'audio');
      
      // Логируем, какие треки уже есть в соединении
      console.log(`Существующие треки для ${peerId}:`, {
        video: hasVideoSender,
        audio: hasAudioSender,
        sendersCount: senders.length
      });
      
      if (this.localStream) {
        // Добавляем видеотрек, если его нет
        if (!hasVideoSender) {
          const videoTracks = this.localStream.getVideoTracks();
          if (videoTracks.length > 0) {
            const videoTrack = videoTracks[0];
            console.log(`Добавляем видеотрек в соединение с ${peerId}`);
            peerConnection.addTrack(videoTrack, this.localStream);
          }
        }
        
        // Добавляем аудиотрек, если его нет
        if (!hasAudioSender) {
          const audioTracks = this.localStream.getAudioTracks();
          if (audioTracks.length > 0) {
            const audioTrack = audioTracks[0];
            console.log(`Добавляем аудиотрек в соединение с ${peerId}`);
            peerConnection.addTrack(audioTrack, this.localStream);
          }
        }
      }
      
      // Создаем предложение
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true, 
        offerToReceiveVideo: true
      });
      
      // Устанавливаем локальное описание
      await peerConnection.setLocalDescription(offer);
      console.log(`Предложение создано для ${peerId}`);
      
      // Возвращаем созданное предложение
      return offer;
    } catch (error) {
      console.error('Ошибка при создании предложения:', error);
      throw error;
    }
  }

  async handleOffer(peerId, offer) {
    try {
      console.log('Обрабатываем входящее предложение от:', peerId);
      
      // Проверяем наличие локального потока
      if (!this.localStream) {
        console.log('Локальный поток отсутствует, инициализируем...');
        try {
          await this.initialize();
        } catch (error) {
          console.error('Ошибка при инициализации локального потока:', error);
          // Продолжаем, даже если нет локального потока - будем только принимать треки
        }
      }
      
      const peerConnection = await this.createPeerConnection(peerId);
      
      // Устанавливаем удаленное описание
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      console.log('Удаленное описание установлено');
      
      // Добавляем локальные треки в соединение, если их еще нет
      if (this.localStream) {
        const senders = peerConnection.getSenders();
        const hasVideoSender = senders.some(sender => sender.track && sender.track.kind === 'video');
        const hasAudioSender = senders.some(sender => sender.track && sender.track.kind === 'audio');
      
        // Добавляем видеотрек, если его нет
        if (!hasVideoSender) {
          const videoTracks = this.localStream.getVideoTracks();
          if (videoTracks.length > 0) {
            const videoTrack = videoTracks[0];
            console.log(`Добавляем видеотрек в соединение с ${peerId}`);
            peerConnection.addTrack(videoTrack, this.localStream);
          }
        }
        
        // Добавляем аудиотрек, если его нет
        if (!hasAudioSender) {
          const audioTracks = this.localStream.getAudioTracks();
          if (audioTracks.length > 0) {
            const audioTrack = audioTracks[0];
            console.log(`Добавляем аудиотрек в соединение с ${peerId}`);
            peerConnection.addTrack(audioTrack, this.localStream);
          }
        }
      }
      
      // Создаем ответ с опциями для приема аудио и видео
      const answer = await peerConnection.createAnswer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      
      await peerConnection.setLocalDescription(answer);
      console.log('Локальное описание (ответ) создано');
      
      return answer;
    } catch (error) {
      console.error('Ошибка при обработке входящего предложения:', error);
      throw error;
    }
  }

  async handleAnswer(peerId, answer) {
    try {
      console.log('Обрабатываем входящий ответ от:', peerId);
      const peerConnection = this.getPeerConnection(peerId);
      
      if (!peerConnection) {
        throw new Error(`Соединение с ${peerId} не найдено`);
      }
      
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      console.log('Удаленное описание (ответ) установлено для', peerId);
      return true;
    } catch (error) {
      console.error('Ошибка при обработке входящего ответа:', error);
      throw error;
    }
  }

  async handleIceCandidate(peerId, candidate) {
    try {
      console.log('Обрабатываем входящий ICE кандидат от:', peerId);
      const peerConnection = this.getPeerConnection(peerId);
      
      if (!peerConnection) {
        throw new Error(`Соединение с ${peerId} не найдено`);
      }
      
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      console.log('ICE кандидат добавлен для', peerId);
      return true;
    } catch (error) {
      console.error('Ошибка при обработке входящего ICE кандидата:', error);
      throw error;
    }
  }

  // Проверка состояния локального потока
  checkLocalStream() {
    if (!this.localStream) {
      console.warn('Локальный поток отсутствует');
      return false;
    }

    // Проверяем активные треки
    const videoTracks = this.localStream.getVideoTracks();
    const audioTracks = this.localStream.getAudioTracks();
    
    console.log('Состояние локального потока:', {
      hasVideoTracks: videoTracks.length > 0,
      hasAudioTracks: audioTracks.length > 0,
      videoTracksEnabled: videoTracks.length > 0 ? videoTracks[0].enabled : false,
      audioTracksEnabled: audioTracks.length > 0 ? audioTracks[0].enabled : false
    });
    
    // Возвращаем true если поток существует
    return true;
  }

  // Проверка и восстановление соединений
  async checkConnections() {
    console.log('Проверка всех соединений...');
    
    // Получаем список всех peer ID
    const peerIds = Array.from(this.peerConnections.keys());
    
    for (const peerId of peerIds) {
      const connection = this.peerConnections.get(peerId);
      
      console.log(`Проверка соединения с ${peerId}:`, {
        connectionState: connection.connectionState,
        iceConnectionState: connection.iceConnectionState,
        signalingState: connection.signalingState
      });
      
      // Проверяем наличие видеотреков в соединении
      const senders = connection.getSenders();
      const hasVideoSender = senders.some(sender => sender.track && sender.track.kind === 'video');
      
      console.log(`Соединение с ${peerId} имеет видеотреки:`, hasVideoSender);
      
      // Если соединение в плохом состоянии, пересоздаем его
      if (
        connection.connectionState === 'failed' || 
        connection.connectionState === 'disconnected' ||
        connection.iceConnectionState === 'failed' ||
        connection.iceConnectionState === 'disconnected'
      ) {
        console.log(`Пересоздаем проблемное соединение с ${peerId}`);
        
        // Закрываем старое соединение
        connection.close();
        this.peerConnections.delete(peerId);
        
        // Создаем новое соединение
        try {
          const newConnection = await this.createPeerConnection(peerId);
          
          // Создаем и отправляем предложение
          const offer = await newConnection.createOffer();
          await newConnection.setLocalDescription(offer);
          socketApi.sendWebRTCOffer(peerId, offer);
          
          console.log(`Соединение с ${peerId} успешно пересоздано`);
        } catch (error) {
          console.error(`Ошибка при пересоздании соединения с ${peerId}:`, error);
        }
      }
    }
  }

  // Обновление треков в существующих соединениях
  async updateTracksInConnections() {
    if (!this.localStream) {
      console.warn('Невозможно обновить треки: локальный поток отсутствует');
      return;
    }
    
    console.log('Обновление треков во всех соединениях...');
    
    const localVideoTracks = this.localStream.getVideoTracks();
    const localAudioTracks = this.localStream.getAudioTracks();
    
    // Проверяем и логируем состояние треков
    if (localVideoTracks.length > 0) {
      console.log('Видеотрек статус:', localVideoTracks[0].enabled ? 'включен' : 'выключен');
    } else {
      console.log('Видеотрек отсутствует');
    }
    
    if (localAudioTracks.length > 0) {
      console.log('Аудиотрек статус:', localAudioTracks[0].enabled ? 'включен' : 'выключен');
    } else {
      console.log('Аудиотрек отсутствует');
    }
    
    // Для каждого соединения
    for (const [peerId, connection] of this.peerConnections.entries()) {
      if (connection.connectionState === 'connected' || 
          connection.connectionState === 'connecting' ||
          connection.connectionState === 'new') {
          
        console.log(`Обновление треков для соединения с ${peerId} (${connection.connectionState})`);
        
        // Получаем текущие отправители
        const senders = connection.getSenders();
        console.log(`Текущие отправители для ${peerId}:`, senders.length);
        
        // Для видеотрека
        if (localVideoTracks.length > 0) {
          const videoTrack = localVideoTracks[0];
          const videoSender = senders.find(s => s.track && s.track.kind === 'video');
          
          if (videoSender) {
            // Проверяем, нужно ли обновить трек
            if (videoSender.track.id !== videoTrack.id || 
                videoSender.track.enabled !== videoTrack.enabled) {
              try {
                console.log(`Заменяем видеотрек для ${peerId}`);
                await videoSender.replaceTrack(videoTrack);
              } catch (error) {
                console.error(`Ошибка при замене видеотрека для ${peerId}:`, error);
                
                // Пробуем альтернативный подход - удаляем и добавляем трек
                try {
                  connection.removeTrack(videoSender);
                  connection.addTrack(videoTrack, this.localStream);
                  console.log(`Переподключен видеотрек для ${peerId} через удаление/добавление`);
                } catch (innerError) {
                  console.error(`Не удалось переподключить видеотрек для ${peerId}:`, innerError);
                }
              }
            } else {
              console.log(`Видеотрек для ${peerId} не требует обновления`);
            }
          } else {
            // Если отправитель не существует, добавляем новый трек
            try {
              connection.addTrack(videoTrack, this.localStream);
              console.log(`Видеотрек добавлен для ${peerId}`);
            } catch (error) {
              console.error(`Ошибка при добавлении видеотрека для ${peerId}:`, error);
            }
          }
        }
        
        // Для аудиотрека
        if (localAudioTracks.length > 0) {
          const audioTrack = localAudioTracks[0];
          const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
          
          if (audioSender) {
            // Проверяем, нужно ли обновить трек
            if (audioSender.track.id !== audioTrack.id || 
                audioSender.track.enabled !== audioTrack.enabled) {
              try {
                console.log(`Заменяем аудиотрек для ${peerId}`);
                await audioSender.replaceTrack(audioTrack);
              } catch (error) {
                console.error(`Ошибка при замене аудиотрека для ${peerId}:`, error);
                
                // Пробуем альтернативный подход - удаляем и добавляем трек
                try {
                  connection.removeTrack(audioSender);
                  connection.addTrack(audioTrack, this.localStream);
                  console.log(`Переподключен аудиотрек для ${peerId} через удаление/добавление`);
                } catch (innerError) {
                  console.error(`Не удалось переподключить аудиотрек для ${peerId}:`, innerError);
                }
              }
            } else {
              console.log(`Аудиотрек для ${peerId} не требует обновления`);
            }
          } else {
            // Если отправитель не существует, добавляем новый трек
            try {
              connection.addTrack(audioTrack, this.localStream);
              console.log(`Аудиотрек добавлен для ${peerId}`);
            } catch (error) {
              console.error(`Ошибка при добавлении аудиотрека для ${peerId}:`, error);
            }
          }
        }
        
        // Если состояние соединения требует обновления предложения, создаем новое
        if (connection.signalingState === 'stable') {
          try {
            console.log(`Создаем новое предложение для ${peerId} после обновления треков`);
            const offer = await connection.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: true
            });
            await connection.setLocalDescription(offer);
            socketApi.sendWebRTCOffer(peerId, offer);
          } catch (error) {
            console.error(`Ошибка при создании нового предложения для ${peerId}:`, error);
          }
        } else {
          console.log(`Пропускаем создание предложения для ${peerId}, состояние сигнализации:`, connection.signalingState);
        }
      } else {
        console.log(`Пропускаем соединение с ${peerId} из-за состояния:`, connection.connectionState);
      }
    }
  }

  // Метод для проверки состояния соединения и переподключения при необходимости
  async reconnectIfNeeded() {
    try {
      // Проверяем, подключен ли сигнальный сервер
      const isSocketConnected = socketApi.isConnected();
      console.log('Проверка соединения с сигнальным сервером:', isSocketConnected);
      
      if (!isSocketConnected) {
        console.log('Сигнальный сервер отключен, пытаемся переподключиться...');
        
        // Попытка переподключения
        await socketApi.init();
        
        // Проверяем результат переподключения
        const reconnected = socketApi.isConnected();
        if (reconnected) {
          console.log('Успешно переподключились к сигнальному серверу');
          
          // Проверяем состояние локального потока
          this.checkLocalStream();
          
          // Проверяем и восстанавливаем все соединения
          await this.checkConnections();
        } else {
          console.error('Не удалось переподключиться к сигнальному серверу');
        }
        
        return reconnected;
      }
      
      return true;
    } catch (error) {
      console.error('Ошибка при проверке и переподключении к сигнальному серверу:', error);
      return false;
    }
  }

  // Полная очистка соединений и ресурсов
  cleanup() {
    try {
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => {
          try {
            console.log('Остановка трека:', track.kind);
            track.stop();
          } catch (trackError) {
            console.error('Ошибка при остановке трека:', trackError);
          }
        });
        this.localStream = null;
      }
      
      this.closeAllConnections();
      this.isInitializing = false;
      this.initializationPromise = null;
      this.deviceInUseRetries = 0;
      this.retryCount = 0;
      
      console.log('WebRTC ресурсы очищены');
    } catch (error) {
      console.error('Ошибка при очистке WebRTC ресурсов:', error);
    }
  }

  // Остановка локального потока
  stopLocalStream() {
    if (this.localStream) {
      try {
        console.log('Остановка локального потока...');
        this.localStream.getTracks().forEach(track => {
          console.log(`Останавливаем ${track.kind} трек`);
          track.stop();
        });
        this.localStream = null;
        console.log('Локальный поток остановлен');
        return true;
      } catch (error) {
        console.error('Ошибка при остановке локального потока:', error);
        return false;
      }
    } else {
      console.log('Локальный поток не существует, нечего останавливать');
      return true;
    }
  }

  // Закрыть конкретное соединение
  closeConnection(peerId) {
    try {
      const connection = this.peerConnections.get(peerId);
      if (connection) {
        console.log(`Закрытие соединения с ${peerId}`);
        connection.close();
        this.peerConnections.delete(peerId);
        return true;
      } else {
        console.log(`Соединение с ${peerId} не найдено`);
        return false;
      }
    } catch (error) {
      console.error(`Ошибка при закрытии соединения с ${peerId}:`, error);
      return false;
    }
  }

  // Остановка всех соединений
  stopAllConnections() {
    try {
      console.log('Остановка всех соединений...');
      
      // Закрываем все соединения
      this.closeAllConnections();
      
      // Останавливаем локальный поток
      this.stopLocalStream();
      
      // Сбрасываем состояние
      this.isInitializing = false;
      this.initializationPromise = null;
      this.deviceInUseRetries = 0;
      this.retryCount = 0;
      
      console.log('Все соединения остановлены');
      return true;
    } catch (error) {
      console.error('Ошибка при остановке всех соединений:', error);
      return false;
    }
  }
}

const webrtcApi = new WebRTCApi();
export default webrtcApi; 