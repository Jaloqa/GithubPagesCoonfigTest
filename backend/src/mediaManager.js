const mediasoup = require('mediasoup');
const os = require('os');
const { Device } = require('mediasoup-client');
const { types } = require('mediasoup');

class MediaManager {
  constructor() {
    this.workers = [];
    this.rooms = new Map(); // roomId -> { router, peers: Map<peerId, peer> }
    this.peers = new Map(); // peerId -> { roomId, transports: [], producers: [], consumers: [] }
    this.numWorkers = Object.keys(os.cpus()).length;
    this.nextWorkerIndex = 0;
    this.device = new Device();
    this.connections = new Map();
    this.localStream = null;
  }

  // Инициализация медиа-серверов mediasoup
  async init() {
    console.log(`Инициализация ${this.numWorkers} mediasoup workers...`);

    // Медиакодеки для аудио и видео
    this.mediaCodecs = [
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2
      },
      {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000,
        parameters: {
          'x-google-start-bitrate': 1000
        }
      },
      {
        kind: 'video',
        mimeType: 'video/H264',
        clockRate: 90000,
        parameters: {
          'packetization-mode': 1,
          'profile-level-id': '42e01f',
          'level-asymmetry-allowed': 1
        }
      }
    ];

    for (let i = 0; i < this.numWorkers; i++) {
      const worker = await mediasoup.createWorker({
        logLevel: 'warn',
        logTags: [
          'info',
          'ice',
          'dtls',
          'rtp',
          'srtp',
          'rtcp'
        ],
        rtcMinPort: 10000 + (i * 100),
        rtcMaxPort: 10099 + (i * 100)
      });

      worker.on('died', () => {
        console.error(`mediasoup worker ${i} died, exiting...`);
        setTimeout(() => process.exit(1), 2000);
      });

      this.workers.push(worker);
      console.log(`mediasoup worker ${i} создан`);
    }
  }

  // Получение следующего воркера в режиме round-robin
  getNextWorker() {
    const worker = this.workers[this.nextWorkerIndex];
    this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.workers.length;
    return worker;
  }

  // Создание медиа-комнаты с роутером
  async createRoom(roomId) {
    // Проверка существования комнаты
    if (this.rooms.has(roomId)) {
      console.log(`Комната ${roomId} уже существует`);
      return this.rooms.get(roomId);
    }

    // Создаем маршрутизатор на одном из воркеров
    const worker = this.getNextWorker();
    const router = await worker.createRouter({ mediaCodecs: this.mediaCodecs });

    // Сохраняем комнату
    const roomData = { 
      router,
      peers: new Map()
    };
    this.rooms.set(roomId, roomData);

    console.log(`Создана новая медиа-комната: ${roomId}`);
    return roomData;
  }

  // Получение данных комнаты
  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  // Создание WebRTC транспорта для клиента
  async createWebRtcTransport(roomId, peerId, direction) {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error(`Комната ${roomId} не найдена`);
    }

    // Настройки транспорта
    const transportOptions = {
      listenIps: [
        { ip: '0.0.0.0', announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || '127.0.0.1' }
      ],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate: 1000000,
      minimumAvailableOutgoingBitrate: 600000,
      maxSctpMessageSize: 262144
    };

    // Создаем транспорт
    const transport = await room.router.createWebRtcTransport(transportOptions);

    // Обработчики событий
    transport.on('dtlsstatechange', (dtlsState) => {
      if (dtlsState === 'closed') {
        console.log(`Transport ${transport.id} для peer ${peerId} закрыт`);
        this.closeTransport(peerId, transport.id);
      }
    });

    transport.on('close', () => {
      console.log(`Transport ${transport.id} закрыт`);
    });

    // Создаем или получаем информацию о пире
    let peer = this.peers.get(peerId);
    if (!peer) {
      peer = {
        roomId,
        transports: [],
        producers: [],
        consumers: []
      };
      this.peers.set(peerId, peer);
      room.peers.set(peerId, peer);
    }

    // Сохраняем транспорт
    peer.transports.push({
      id: transport.id,
      transport,
      direction
    });

    // Возвращаем параметры транспорта для клиента
    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
      sctpParameters: transport.sctpParameters
    };
  }

  // Подключение к транспорту (DtlsParameters)
  async connectTransport(peerId, transportId, dtlsParameters) {
    const peer = this.peers.get(peerId);
    if (!peer) {
      throw new Error(`Peer ${peerId} не найден`);
    }

    const transportData = peer.transports.find(t => t.id === transportId);
    if (!transportData) {
      throw new Error(`Transport ${transportId} не найден для peer ${peerId}`);
    }

    await transportData.transport.connect({ dtlsParameters });
    console.log(`Transport ${transportId} для peer ${peerId} успешно подключен`);
  }

  // Создание продюсера для отправки медиа-потока
  async createProducer(peerId, transportId, kind, rtpParameters) {
    const peer = this.peers.get(peerId);
    if (!peer) {
      throw new Error(`Peer ${peerId} не найден`);
    }

    const transportData = peer.transports.find(t => t.id === transportId && t.direction === 'send');
    if (!transportData) {
      throw new Error(`Send transport ${transportId} не найден для peer ${peerId}`);
    }

    // Создаем продюсер для отправки аудио или видео
    const producer = await transportData.transport.produce({ kind, rtpParameters });

    // Сохраняем продюсер
    peer.producers.push({
      id: producer.id,
      producer,
      kind
    });

    // Обработчики событий
    producer.on('close', () => {
      console.log(`Producer ${producer.id} закрыт`);
      peer.producers = peer.producers.filter(p => p.id !== producer.id);
    });

    // Уведомляем остальных пиров о новом потоке
    this.broadcastNewProducer(peer.roomId, peerId, producer.id, kind);

    return { id: producer.id };
  }

  // Уведомление о новом продюсере всех пиров в комнате
  async broadcastNewProducer(roomId, sourcePeerId, producerId, kind) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    // Для каждого пира в комнате (кроме источника)
    for (const [peerId, peer] of room.peers.entries()) {
      if (peerId !== sourcePeerId) {
        // Найти receive транспорт
        const transportData = peer.transports.find(t => t.direction === 'recv');
        if (transportData) {
          try {
            // Создать потребителя для приема потока
            await this.createConsumer(
              roomId,
              peerId,
              transportData.id,
              sourcePeerId,
              producerId,
              kind
            );
          } catch (error) {
            console.error(`Ошибка создания consumer для peer ${peerId}:`, error);
          }
        }
      }
    }
  }

  // Создание консьюмера для приема медиа-потока
  async createConsumer(roomId, peerId, transportId, producerPeerId, producerId, kind) {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error(`Комната ${roomId} не найдена`);
    }

    // Получаем пира-потребителя
    const peer = this.peers.get(peerId);
    if (!peer) {
      throw new Error(`Peer ${peerId} не найден`);
    }

    // Получаем транспорт для приема
    const transportData = peer.transports.find(t => t.id === transportId && t.direction === 'recv');
    if (!transportData) {
      throw new Error(`Receive transport ${transportId} не найден для peer ${peerId}`);
    }

    // Получаем пира-производителя
    const producerPeer = this.peers.get(producerPeerId);
    if (!producerPeer) {
      throw new Error(`Producer peer ${producerPeerId} не найден`);
    }

    // Находим соответствующий продюсер
    const producerData = producerPeer.producers.find(p => p.id === producerId);
    if (!producerData) {
      throw new Error(`Producer ${producerId} не найден`);
    }

    // Проверяем, может ли пир потреблять этот тип медиа
    if (!room.router.canConsume({
      producerId: producerData.producer.id,
      rtpCapabilities: peer.rtpCapabilities
    })) {
      throw new Error(`Peer ${peerId} не может потреблять ${kind} от ${producerPeerId}`);
    }

    // Создаем потребителя
    const consumer = await transportData.transport.consume({
      producerId: producerData.producer.id,
      rtpCapabilities: peer.rtpCapabilities,
      paused: true, // Начинаем с паузы для избежания потерь пакетов
    });

    // Сохраняем потребителя
    peer.consumers.push({
      id: consumer.id,
      consumer,
      producerId: producerData.producer.id,
      producerPeerId,
      kind
    });

    // Обработчики событий
    consumer.on('close', () => {
      console.log(`Consumer ${consumer.id} закрыт`);
      peer.consumers = peer.consumers.filter(c => c.id !== consumer.id);
    });

    consumer.on('producerclose', () => {
      console.log(`Producer для consumer ${consumer.id} закрыт`);
      // Удаляем consumer
      consumer.close();
      peer.consumers = peer.consumers.filter(c => c.id !== consumer.id);
    });

    // Возвращаем параметры для клиента
    return {
      id: consumer.id,
      producerId: producerData.producer.id,
      producerPeerId,
      kind,
      rtpParameters: consumer.rtpParameters,
      type: consumer.type
    };
  }

  // Возобновление потребления потока
  async resumeConsumer(peerId, consumerId) {
    const peer = this.peers.get(peerId);
    if (!peer) {
      throw new Error(`Peer ${peerId} не найден`);
    }

    const consumerData = peer.consumers.find(c => c.id === consumerId);
    if (!consumerData) {
      throw new Error(`Consumer ${consumerId} не найден для peer ${peerId}`);
    }

    await consumerData.consumer.resume();
    console.log(`Consumer ${consumerId} для peer ${peerId} возобновлен`);
  }

  // Закрытие транспорта
  closeTransport(peerId, transportId) {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    const transportData = peer.transports.find(t => t.id === transportId);
    if (transportData) {
      transportData.transport.close();
      peer.transports = peer.transports.filter(t => t.id !== transportId);
    }
  }

  // Получение информации о возможностях роутера
  getRouterRtpCapabilities(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error(`Комната ${roomId} не найдена`);
    }
    return room.router.rtpCapabilities;
  }

  // Сохранение RTP возможностей клиента
  setRtpCapabilities(peerId, rtpCapabilities) {
    const peer = this.peers.get(peerId);
    if (!peer) {
      throw new Error(`Peer ${peerId} не найден`);
    }

    peer.rtpCapabilities = rtpCapabilities;
  }

  // Удаление пира из комнаты
  async removePeer(peerId) {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    const roomId = peer.roomId;
    const room = this.rooms.get(roomId);

    // Закрытие всех транспортов
    for (const transportData of peer.transports) {
      transportData.transport.close();
    }

    // Удаление пира из комнаты и глобального списка
    if (room) {
      room.peers.delete(peerId);
      console.log(`Peer ${peerId} удален из комнаты ${roomId}`);

      // Если в комнате не осталось пиров, закрываем ее
      if (room.peers.size === 0) {
        console.log(`Закрываем пустую комнату ${roomId}`);
        this.rooms.delete(roomId);
      }
    }

    this.peers.delete(peerId);
  }

  // Проверка активности пира (отправка сообщения ping/pong)
  pingPeer(peerId) {
    return this.peers.has(peerId);
  }

  // Получение списка активных пиров в комнате
  getPeersInRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return [];

    return Array.from(room.peers.keys());
  }

  // Очистка ресурсов
  async close() {
    // Закрытие всех комнат
    for (const [roomId, room] of this.rooms.entries()) {
      console.log(`Закрытие комнаты ${roomId}`);
      // Закрытие всех пиров в комнате
      for (const peerId of room.peers.keys()) {
        await this.removePeer(peerId);
      }
    }

    // Закрытие всех воркеров
    for (const worker of this.workers) {
      await worker.close();
    }

    this.workers = [];
    this.rooms.clear();
    this.peers.clear();
    console.log('MediaManager закрыт');
  }

  // Инициализация устройства
  async initDevice(routerRtpCapabilities) {
    try {
      await this.device.load({ routerRtpCapabilities });
      return { success: true };
    } catch (error) {
      console.error('Ошибка инициализации устройства:', error);
      return { success: false, error: error.message };
    }
  }

  // Создание транспортного соединения
  async createTransport(transportInfo) {
    try {
      const transport = await this.device.createSendTransport(transportInfo);
      this.connections.set(transport.id, transport);
      return { success: true, transport };
    } catch (error) {
      console.error('Ошибка создания транспортного соединения:', error);
      return { success: false, error: error.message };
    }
  }

  // Подключение к удаленному транспорту
  async connectTransport(transportId, dtlsParameters) {
    try {
      const transport = this.connections.get(transportId);
      if (!transport) {
        throw new Error('Транспорт не найден');
      }
      await transport.connect({ dtlsParameters });
      return { success: true };
    } catch (error) {
      console.error('Ошибка подключения к транспорту:', error);
      return { success: false, error: error.message };
    }
  }

  // Отправка медиапотока
  async sendTrack(transportId, track) {
    try {
      const transport = this.connections.get(transportId);
      if (!transport) {
        throw new Error('Транспорт не найден');
      }
      const producer = await transport.produce({ track });
      return { success: true, producer };
    } catch (error) {
      console.error('Ошибка отправки медиапотока:', error);
      return { success: false, error: error.message };
    }
  }

  // Получение медиапотока
  async receiveTrack(transportId, producerId) {
    try {
      const transport = this.connections.get(transportId);
      if (!transport) {
        throw new Error('Транспорт не найден');
      }
      const consumer = await transport.consume({ producerId });
      return { success: true, consumer };
    } catch (error) {
      console.error('Ошибка получения медиапотока:', error);
      return { success: false, error: error.message };
    }
  }

  // Остановка всех соединений
  stopAllConnections() {
    this.connections.forEach(transport => {
      transport.close();
    });
    this.connections.clear();
  }

  // Остановка локального потока
  stopLocalStream() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
  }
}

// Экспортируем синглтон
const mediaManager = new MediaManager();
module.exports = mediaManager; 