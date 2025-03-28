import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import gameManager from './gameManager.js';
import mediaManager from './mediaManager.js';
import dotenv from 'dotenv';

// Загрузка переменных окружения из .env файла
dotenv.config();

const app = express();
const port = process.env.PORT || 3002;
const httpServer = createServer(app);

// Переменная для отслеживания состояния инициализации mediasoup
let mediasoupReady = false;

// Настройка CORS - разрешаем запросы со всех доменов
app.use(cors({
  origin: '*',  // Разрешаем запросы с любого домена
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: false
}));

app.use(express.json());

// Настройка Socket.IO с CORS
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept"],
    credentials: false,
    transports: ['websocket', 'polling']
  },
  allowEIO3: true
});

// Инициализируем mediasoup
(async () => {
  try {
    await mediaManager.init();
    console.log('mediasoup инициализирован успешно');
    mediasoupReady = true;
  } catch (error) {
    console.error('Ошибка инициализации mediasoup:', error);
  }
})();

// Очистка старых комнат каждый час
setInterval(() => {
  gameManager.cleanupRooms();
}, 3600000); // 3600000 мс = 1 час

// Тестовый маршрут
app.get('/', (req, res) => {
  res.json({ 
    message: 'Соединение с бэкендом успешно установлено!',
    mediasoupReady: mediasoupReady 
  });
});

// WebSocket обработчики
io.on('connection', (socket) => {
  console.log('Новое соединение:', socket.id);
  
  // Обновляем существующие комнаты, если игрок был в них ранее
  Object.keys(gameManager.rooms).forEach(roomCode => {
    const room = gameManager.rooms[roomCode];
    const existingPlayerIndex = room.players.findIndex(p => p.id === socket.id);
    
    if (existingPlayerIndex !== -1) {
      console.log(`Игрок ${socket.id} уже был в комнате ${roomCode}, обновляем соединение`);
      // Обновляем ID сокета, если нужно
    }
  });
  
  // Создание комнаты
  socket.on('create-room', ({ playerName }) => {
    const playerId = socket.id;
    
    // Проверка имени
    if (!playerName || !playerName.trim()) {
      socket.emit('room-created', {
        success: false,
        error: 'Имя игрока не указано'
      });
      return;
    }
    
    const roomCode = gameManager.createRoom(playerId, playerName);
    
    socket.join(roomCode);
    
    // Создаем медиа-комнату для WebRTC соединений
    if (mediasoupReady) {
      mediaManager.createRoom(roomCode).catch(error => {
        console.error(`Ошибка создания mediasoup комнаты ${roomCode}:`, error);
      });
    }
    
    // Отправляем код комнаты создателю
    socket.emit('room-created', {
      success: true,
      roomCode,
      playerId,
      isHost: true
    });
    
    console.log(`Комната создана: ${roomCode} игроком ${playerName}`);
  });
  
  // Присоединение к комнате
  socket.on('join-room', ({ roomCode, playerName }) => {
    const playerId = socket.id;
    
    // Проверка имени
    if (!playerName || !playerName.trim()) {
      socket.emit('room-joined', {
        success: false,
        error: 'Имя игрока не указано'
      });
      return;
    }
    
    // Проверка кода комнаты
    if (!roomCode || !roomCode.trim()) {
      socket.emit('room-joined', {
        success: false,
        error: 'Код комнаты не указан'
      });
      return;
    }
    
    const result = gameManager.joinRoom(roomCode, playerId, playerName);
    
    if (result.success) {
      socket.join(roomCode);
      
      // Отправляем данные комнаты присоединившемуся игроку
      socket.emit('room-joined', {
        success: true,
        roomCode,
        playerId,
        isHost: false
      });
      
      // Оповещаем всех в комнате о новом игроке
      io.to(roomCode).emit('room-updated', {
        players: result.roomData.players,
        gameStarted: result.roomData.gameStarted
      });
      
      console.log(`Игрок ${playerName} присоединился к комнате ${roomCode}`);
    } else {
      // Отправляем ошибку игроку
      socket.emit('room-joined', {
        success: false,
        error: result.error
      });
      
      console.log(`Ошибка присоединения к комнате ${roomCode}: ${result.error}`);
    }
  });
  
  // Начало игры
  socket.on('start-game', ({ roomCode }) => {
    const room = gameManager.getRoom(roomCode);
    
    // Проверяем, что запрос от хоста
    if (room && room.hostId === socket.id) {
      const success = gameManager.startGame(roomCode);
      
      if (success) {
        const updatedRoom = gameManager.getRoom(roomCode);
        
        // Оповещаем всех игроков о начале игры
        io.to(roomCode).emit('game-started', {
          gameStarted: true,
          characterAssignments: updatedRoom.characterAssignments
        });
        
        console.log(`Игра началась в комнате ${roomCode}`);
      }
    }
  });
  
  // ===== mediasoup обработчики =====
  
  // Получение RTP возможностей роутера
  socket.on('getRouterRtpCapabilities', async ({ roomId }, callback) => {
    if (typeof callback !== 'function') {
      console.error('Ошибка: callback не является функцией в getRouterRtpCapabilities');
      return;
    }
    
    if (!mediasoupReady) {
      callback({ error: 'mediasoup не готов' });
      return;
    }
    
    try {
      const rtpCapabilities = mediaManager.getRouterRtpCapabilities(roomId);
      callback({ rtpCapabilities });
    } catch (error) {
      console.error('Ошибка при получении RTP возможностей:', error);
      callback({ error: error.message });
    }
  });
  
  // Создание WebRTC транспорта
  socket.on('createWebRtcTransport', async ({ roomId, direction }, callback) => {
    if (typeof callback !== 'function') {
      console.error('Ошибка: callback не является функцией в createWebRtcTransport');
      return;
    }
    
    if (!mediasoupReady) {
      callback({ error: 'mediasoup не готов' });
      return;
    }
    
    try {
      const transportOptions = await mediaManager.createWebRtcTransport(
        roomId,
        socket.id,
        direction
      );
      
      callback(transportOptions);
    } catch (error) {
      console.error('Ошибка при создании транспорта:', error);
      callback({ error: error.message });
    }
  });
  
  // Подключение транспорта
  socket.on('connectWebRtcTransport', async ({ transportId, dtlsParameters }, callback) => {
    if (typeof callback !== 'function') {
      console.error('Ошибка: callback не является функцией в connectWebRtcTransport');
      return;
    }
    
    if (!mediasoupReady) {
      callback({ error: 'mediasoup не готов' });
      return;
    }
    
    try {
      await mediaManager.connectTransport(
        socket.id,
        transportId,
        dtlsParameters
      );
      
      callback({ connected: true });
    } catch (error) {
      console.error('Ошибка при подключении транспорта:', error);
      callback({ error: error.message });
    }
  });
  
  // Установка RTP возможностей клиента
  socket.on('setRtpCapabilities', async ({ rtpCapabilities }, callback) => {
    if (typeof callback !== 'function') {
      console.error('Ошибка: callback не является функцией в setRtpCapabilities');
      return;
    }
    
    if (!mediasoupReady) {
      callback({ error: 'mediasoup не готов' });
      return;
    }
    
    try {
      mediaManager.setRtpCapabilities(socket.id, rtpCapabilities);
      callback({ success: true });
    } catch (error) {
      console.error('Ошибка при установке RTP возможностей:', error);
      callback({ error: error.message });
    }
  });
  
  // Создание продюсера для отправки потока
  socket.on('produce', async ({ transportId, kind, rtpParameters }, callback) => {
    if (typeof callback !== 'function') {
      console.error('Ошибка: callback не является функцией в produce');
      return;
    }
    
    if (!mediasoupReady) {
      callback({ error: 'mediasoup не готов' });
      return;
    }
    
    try {
      const producerInfo = await mediaManager.createProducer(
        socket.id,
        transportId,
        kind,
        rtpParameters
      );
      
      callback(producerInfo);
    } catch (error) {
      console.error('Ошибка при создании продюсера:', error);
      callback({ error: error.message });
    }
  });
  
  // Создание потребителя для получения потока
  socket.on('consume', async ({ roomId, transportId, producerPeerId, producerId, kind }, callback) => {
    if (typeof callback !== 'function') {
      console.error('Ошибка: callback не является функцией в consume');
      return;
    }
    
    if (!mediasoupReady) {
      callback({ error: 'mediasoup не готов' });
      return;
    }
    
    try {
      const consumerInfo = await mediaManager.createConsumer(
        roomId,
        socket.id,
        transportId,
        producerPeerId,
        producerId,
        kind
      );
      
      callback(consumerInfo);
    } catch (error) {
      console.error('Ошибка при создании потребителя:', error);
      callback({ error: error.message });
    }
  });
  
  // Возобновление потребления потока
  socket.on('resumeConsumer', async ({ consumerId }, callback) => {
    if (typeof callback !== 'function') {
      console.error('Ошибка: callback не является функцией в resumeConsumer');
      return;
    }
    
    if (!mediasoupReady) {
      callback({ error: 'mediasoup не готов' });
      return;
    }
    
    try {
      await mediaManager.resumeConsumer(socket.id, consumerId);
      callback({ resumed: true });
    } catch (error) {
      console.error('Ошибка при возобновлении потребителя:', error);
      callback({ error: error.message });
    }
  });
  
  // Получение списка пиров в комнате
  socket.on('getPeersInRoom', ({ roomId }, callback) => {
    if (typeof callback !== 'function') {
      console.error('Ошибка: callback не является функцией в getPeersInRoom');
      return;
    }
    
    if (!mediasoupReady) {
      callback({ peers: [] });
      return;
    }
    
    try {
      const peers = mediaManager.getPeersInRoom(roomId);
      callback({ peers });
    } catch (error) {
      console.error('Ошибка при получении списка пиров:', error);
      callback({ error: error.message });
    }
  });
  
  // Обновление статуса видео
  socket.on('video-status', ({ roomCode, enabled }) => {
    console.log(`Получен запрос на обновление статуса видео: Игрок ${socket.id}, комната ${roomCode}, статус: ${enabled}`);
    
    const success = gameManager.updatePlayer(roomCode, socket.id, { videoEnabled: enabled });
    
    if (success) {
      const room = gameManager.getRoom(roomCode);
      console.log(`Обновлен статус видео для игрока ${socket.id} на ${enabled}`);
      
      // Оповещаем всех о статусе видео
      io.to(roomCode).emit('room-updated', {
        players: room.players,
        gameStarted: room.gameStarted
      });
      
      console.log(`Отправлено обновление комнаты ${roomCode} всем игрокам`);
    } else {
      console.error(`Ошибка обновления статуса видео: Игрок ${socket.id}, комната ${roomCode}`);
    }
  });
  
  // Установка персонажа
  socket.on('set-character', ({ roomCode, targetPlayerId, character }) => {
    const success = gameManager.setCharacter(roomCode, targetPlayerId, character);
    
    if (success) {
      const room = gameManager.getRoom(roomCode);
      
      // Оповещаем всех об обновлении
      io.to(roomCode).emit('room-updated', {
        players: room.players,
        gameStarted: room.gameStarted
      });
      
      console.log(`Установлен персонаж для игрока в комнате ${roomCode}`);
    }
  });
  
  // Выход из комнаты
  socket.on('leave-room', ({ roomCode }) => {
    console.log(`Игрок ${socket.id} покидает комнату ${roomCode}`);
    
    const playerName = gameManager.getPlayerName(roomCode, socket.id) || 'Игрок';
    const success = gameManager.removePlayer(roomCode, socket.id);
    
    if (success) {
      socket.leave(roomCode);
      
      // Удаляем пира из медиа-комнаты
      if (mediasoupReady) {
        mediaManager.removePeer(socket.id).catch(error => {
          console.error(`Ошибка удаления mediasoup пира ${socket.id}:`, error);
        });
      }
      
      // Если комната всё ещё существует, оповещаем оставшихся игроков
      const updatedRoom = gameManager.getRoom(roomCode);
      if (updatedRoom) {
        io.to(roomCode).emit('room-updated', {
          players: updatedRoom.players,
          gameStarted: updatedRoom.gameStarted
        });
        
        console.log(`Игрок ${playerName} покинул комнату ${roomCode}`);
      }
    }
  });
  
  // Запрос информации о комнате
  socket.on('get-room-info', ({ roomCode }) => {
    console.log(`Запрос информации о комнате ${roomCode} от игрока ${socket.id}`);
    
    const room = gameManager.getRoom(roomCode);
    if (room) {
      // Проверим, входит ли запрашивающий в число игроков комнаты
      const isInRoom = room.players.some(p => p.id === socket.id);
      
      // Если игрок - хост и не находится в комнате, добавим его
      if (room.hostId === socket.id && !isInRoom) {
        console.log(`Добавляем хоста ${socket.id} в комнату ${roomCode}`);
        socket.join(roomCode);
      }
      
      // Отправляем обновление только запросившему игроку
      socket.emit('room-updated', {
        players: room.players,
        gameStarted: room.gameStarted
      });
      
      console.log(`Отправлена информация о комнате ${roomCode}, количество игроков: ${room.players.length}`);
    }
  });
  
  // Обновление статуса медиа (аудио и видео)
  socket.on('updateMediaStatus', ({ roomId, videoEnabled, audioEnabled }, callback) => {
    if (typeof callback !== 'function') {
      console.error('Ошибка: callback не является функцией в updateMediaStatus');
      return;
    }
    
    if (!mediasoupReady) {
      callback({ error: 'mediasoup не готов' });
      return;
    }
    
    console.log(`Обновление статуса медиа для ${socket.id} в комнате ${roomId}: видео=${videoEnabled}, аудио=${audioEnabled}`);
    
    try {
      // Обновляем статус в комнате игры (для UI)
      const success = gameManager.updatePlayer(roomId, socket.id, { 
        videoEnabled, 
        audioEnabled 
      });
      
      if (success) {
        const room = gameManager.getRoom(roomId);
        // Оповещаем всех игроков об обновлении
        io.to(roomId).emit('room-updated', {
          players: room.players,
          gameStarted: room.gameStarted
        });
      }
      
      callback({ success: true });
    } catch (error) {
      console.error('Ошибка при обновлении статуса медиа:', error);
      callback({ error: error.message });
    }
  });
  
  // Отключение игрока
  socket.on('disconnect', () => {
    console.log('Отключение:', socket.id);
    
    // Удаляем пира из медиа-комнат
    if (mediasoupReady) {
      mediaManager.removePeer(socket.id).catch(error => {
        console.error(`Ошибка удаления mediasoup пира ${socket.id}:`, error);
      });
    }
    
    // Находим комнаты, в которых был игрок
    Object.keys(gameManager.rooms).forEach(roomCode => {
      const room = gameManager.rooms[roomCode];
      
      if (room.players.some(p => p.id === socket.id)) {
        const playerName = room.players.find(p => p.id === socket.id)?.name || 'Игрок';
        
        // Удаляем игрока из комнаты
        const success = gameManager.removePlayer(roomCode, socket.id);
        
        if (success) {
          // Если комната всё ещё существует, оповещаем оставшихся игроков
          const updatedRoom = gameManager.getRoom(roomCode);
          if (updatedRoom) {
            io.to(roomCode).emit('room-updated', {
              players: updatedRoom.players,
              gameStarted: updatedRoom.gameStarted
            });
            
            console.log(`Игрок ${playerName} покинул комнату ${roomCode}`);
          }
        }
      }
    });
  });
});

// При завершении работы сервера, закрываем mediasoup
process.on('SIGINT', async () => {
  console.log('Получен сигнал SIGINT, закрытие сервера...');
  
  if (mediasoupReady) {
    await mediaManager.close();
  }
  
  process.exit(0);
});

// Обработка ошибок
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Что-то пошло не так!' });
});

// Запускаем сервер с поддержкой WebSockets
httpServer.listen(port, () => {
  console.log(`Сервер запущен на порту ${port}`);
});

export default app;