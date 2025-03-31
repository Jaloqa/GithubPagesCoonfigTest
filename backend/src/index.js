import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

// Загрузка переменных окружения из .env файла
dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
  },
  transports: ['polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000,
  allowUpgrades: false,
  maxHttpBufferSize: 1e8,
  path: '/socket.io/'
});

// Middleware
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: true
}));

app.use(express.json());

// Хранение информации о комнатах и игроках
let rooms = {}; // { roomId: { players: [], gameStarted: false, characterAssignments: {} } }

// Тестовый маршрут
app.get('/', (req, res) => {
  res.json({ 
    message: 'Соединение с бэкендом успешно установлено!',
    rooms: Object.keys(rooms).length
  });
});

// Обработка ошибок
io.engine.on('connection_error', (err) => {
  console.error('Ошибка подключения:', err);
});

// Обработка подключений
io.on('connection', (socket) => {
  console.log('Клиент подключился:', socket.id);

  socket.on('disconnect', () => {
    console.log('Клиент отключился:', socket.id);
  });

  // Обработка ошибок сокета
  socket.on('error', (error) => {
    console.error('Ошибка сокета:', error);
  });

  // Создание комнаты
  socket.on('create-room', ({ playerName }) => {
    const roomId = generateRoomCode();
    
    if (!rooms[roomId]) {
      rooms[roomId] = {
        players: [],
        gameStarted: false,
        hostId: socket.id,
        characterAssignments: {}
      };
    }
    
    // Добавляем игрока в комнату
    rooms[roomId].players.push({
      id: socket.id,
      name: playerName,
      isHost: true
    });
    
    socket.join(roomId);
    
    // Отправляем подтверждение создателю комнаты
    socket.emit('room-created', {
      success: true,
      roomCode: roomId,
      playerId: socket.id,
      isHost: true
    });
    
    console.log(`Комната создана: ${roomId} игроком ${playerName}`);
  });
  
  // Присоединение к комнате
  socket.on('join-room', ({ roomCode, playerName }) => {
    // Проверяем существование комнаты
    if (!rooms[roomCode]) {
      socket.emit('room-joined', {
        success: false,
        error: 'Комната не найдена'
      });
      return;
    }
    
    // Добавляем игрока в комнату
    rooms[roomCode].players.push({
      id: socket.id,
      name: playerName,
      isHost: false
    });
    
    socket.join(roomCode);
    
    // Сообщаем другим игрокам о новом участнике
    socket.broadcast.to(roomCode).emit('player-joined', socket.id);
      
      // Отправляем данные комнаты присоединившемуся игроку
      socket.emit('room-joined', {
        success: true,
        roomCode,
      playerId: socket.id,
        isHost: false
      });
      
      // Оповещаем всех в комнате о новом игроке
      io.to(roomCode).emit('room-updated', {
      players: rooms[roomCode].players,
      gameStarted: rooms[roomCode].gameStarted
      });
      
      console.log(`Игрок ${playerName} присоединился к комнате ${roomCode}`);
      });
      
  // WebRTC сигналинг
  socket.on('signal', ({ to, signal }) => {
    io.to(to).emit('signal', { from: socket.id, signal });
  });
  
  // Начало игры
  socket.on('start-game', ({ roomCode }) => {
    const room = rooms[roomCode];
    
    // Проверяем, что запрос от хоста
    if (room && room.hostId === socket.id) {
      room.gameStarted = true;
      
      // Создаем случайные назначения персонажей
      const playerIds = room.players.map(player => player.id);
      room.characterAssignments = assignCharacters(playerIds);
        
        // Оповещаем всех игроков о начале игры
        io.to(roomCode).emit('game-started', {
          gameStarted: true,
        characterAssignments: room.characterAssignments
      });
      
      console.log(`Игра началась в комнате ${roomCode}`);
    }
  });

  // Назначение персонажа
  socket.on('assign-character', ({ roomCode, targetPlayerId, character }) => {
    const room = rooms[roomCode];
    
    if (room && room.gameStarted) {
      // Сохраняем назначенный персонаж
      if (!room.characters) room.characters = {};
      room.characters[targetPlayerId] = character;
      
      // Оповещаем игрока о назначенном ему персонаже
      io.to(targetPlayerId).emit('character-assigned', {
        character,
        assignedBy: socket.id
      });
      
      console.log(`Персонаж "${character}" назначен игроку в комнате ${roomCode}`);
    }
  });

  // Обработка отключения
  socket.on('disconnect', () => {
    console.log('Игрок отключился:', socket.id);
    
    // Находим все комнаты, в которых был игрок
    for (let roomId in rooms) {
      let room = rooms[roomId];
      
      // Удаляем игрока из списка
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      
      if (playerIndex !== -1) {
        // Удаляем игрока из комнаты
        room.players.splice(playerIndex, 1);
        
        // Если это был хост, назначаем нового хоста или закрываем комнату
        if (room.hostId === socket.id) {
          if (room.players.length > 0) {
            // Назначаем нового хоста
            room.hostId = room.players[0].id;
            room.players[0].isHost = true;
          } else {
            // Если никого не осталось, удаляем комнату
            delete rooms[roomId];
            continue;
          }
        }
        
        // Оповещаем остальных игроков
        socket.broadcast.to(roomId).emit('player-left', socket.id);
        
        // Обновляем информацию о комнате для оставшихся игроков
        io.to(roomId).emit('room-updated', {
          players: room.players,
          gameStarted: room.gameStarted
        });
      }
    }
  });

  // Обработчик для получения списка игроков в комнате
  socket.on('get-players', ({ roomCode }) => {
    console.log(`Запрос списка игроков в комнате ${roomCode} от ${socket.id}`);
    
    const room = rooms[roomCode];
    if (!room) {
      socket.emit('error', { message: 'Комната не найдена' });
      return;
    }
    
    // Отправляем обновление комнаты, чтобы синхронизировать список игроков
    socket.emit('room-updated', {
      players: room.players,
      gameStarted: room.gameStarted,
      characterAssignments: room.characterAssignments,
      characters: room.characters
    });
  });
});

// Генерация кода комнаты (4 символа)
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Распределение персонажей между игроками
function assignCharacters(playerIds) {
  const assignments = {};
  
  // Каждый игрок назначает персонажа следующему игроку по кругу
  for (let i = 0; i < playerIds.length; i++) {
    const currentPlayerId = playerIds[i];
    const targetPlayerId = playerIds[(i + 1) % playerIds.length];
    assignments[currentPlayerId] = targetPlayerId;
  }
  
  return assignments;
}

// Определение порта и запуск сервера
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});