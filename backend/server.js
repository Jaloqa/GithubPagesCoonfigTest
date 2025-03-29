const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { generateRoomCode } = require('./utils/roomUtils');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Хранение состояния комнат
let rooms = {};

// Socket.io логика
io.on('connection', (socket) => {
  console.log('Игрок подключился:', socket.id);
  
  // Функция для создания уникальной комнаты
  socket.on('create-room', ({ playerName }) => {
    const roomCode = generateRoomCode();
    
    // Если комната с таким кодом уже существует, генерируем новый код
    if (rooms[roomCode]) {
      return socket.emit('create-room-error', { message: 'Комната с таким кодом уже существует' });
    }
    
    // Создаем комнату
    rooms[roomCode] = {
      players: [{
        id: socket.id,
        name: playerName,
        isHost: true
      }],
      gameStarted: false,
      // Соответствие кто кому загадывает персонажа
      characterAssignments: {},
      // Персонажи игроков
      characters: {}
    };
    
    // Присоединяемся к комнате
    socket.join(roomCode);
    
    // Отвечаем успешным созданием
    socket.emit('room-created', { 
      success: true, 
      roomCode, 
      playerId: socket.id, 
      isHost: true 
    });
    
    // Отправляем обновление всем игрокам в комнате
    io.to(roomCode).emit('room-updated', rooms[roomCode]);
    
    console.log(`Создана комната: ${roomCode}, игрок ${playerName} (${socket.id})`);
  });
  
  // Функция для присоединения к комнате
  socket.on('join-room', ({ roomCode, playerName }) => {
    if (!roomCode) {
      return socket.emit('join-room-error', { message: 'Не указан код комнаты' });
    }
    
    // Проверяем существование комнаты
    if (!rooms[roomCode]) {
      return socket.emit('join-room-error', { message: 'Комната не найдена' });
    }
    
    // Проверяем, не началась ли уже игра
    if (rooms[roomCode].gameStarted) {
      return socket.emit('join-room-error', { message: 'Игра уже началась' });
    }
    
    // Проверяем, есть ли уже этот игрок в комнате
    const existingPlayer = rooms[roomCode].players.find(p => p.id === socket.id);
    if (existingPlayer) {
      existingPlayer.name = playerName; // Обновляем имя, если игрок уже есть
    } else {
      // Добавляем игрока в комнату
      rooms[roomCode].players.push({
        id: socket.id,
        name: playerName,
        isHost: false
      });
    }
    
    // Присоединяемся к комнате
    socket.join(roomCode);
    
    // Отвечаем успешным присоединением
    socket.emit('join-room-success', { 
      success: true, 
      roomCode, 
      playerId: socket.id, 
      isHost: false 
    });
    
    // Отправляем обновление всем игрокам в комнате
    io.to(roomCode).emit('room-updated', rooms[roomCode]);

    // Отправляем список всех игроков в комнате новому игроку
    const otherPlayers = rooms[roomCode].players
      .filter(player => player.id !== socket.id)
      .map(player => player.id);
    socket.emit('all-players', otherPlayers);
    
    // Уведомляем всех уже присутствующих игроков о новом участнике
    socket.to(roomCode).emit('player-joined', socket.id);
    
    console.log(`Игрок ${playerName} (${socket.id}) присоединился к комнате ${roomCode}`);
  });
  
  // Функция для старта игры
  socket.on('start-game', ({ roomCode }) => {
    if (!roomCode || !rooms[roomCode]) {
      return socket.emit('start-game-error', { message: 'Комната не найдена' });
    }
    
    // Проверяем, является ли игрок хостом
    const player = rooms[roomCode].players.find(p => p.id === socket.id);
    if (!player || !player.isHost) {
      return socket.emit('start-game-error', { message: 'Только хост может начать игру' });
    }
    
    // Проверяем минимальное количество игроков
    if (rooms[roomCode].players.length < 2) {
      return socket.emit('start-game-error', { message: 'Нужно минимум 2 игрока для начала игры' });
    }
    
    // Назначаем каждому игроку игрока, которому он должен загадать персонажа
    const players = rooms[roomCode].players;
    const characterAssignments = {};
    
    // Случайно перемешиваем игроков для назначения
    const shuffledPlayers = [...players].sort(() => Math.random() - 0.5);
    
    // Назначаем каждому игроку следующего в перемешанном списке
    shuffledPlayers.forEach((player, index) => {
      const nextPlayerIndex = (index + 1) % shuffledPlayers.length;
      characterAssignments[player.id] = shuffledPlayers[nextPlayerIndex].id;
    });
    
    // Сохраняем назначения
    rooms[roomCode].characterAssignments = characterAssignments;
    rooms[roomCode].gameStarted = true;
    
    // Оповещаем всех игроков о начале игры
    io.to(roomCode).emit('game-started', {
      characterAssignments
    });
    
    // Обновляем информацию о комнате
    io.to(roomCode).emit('room-updated', rooms[roomCode]);
    
    console.log(`Игра в комнате ${roomCode} началась`);
  });
  
  // Назначение персонажа игроку
  socket.on('assign-character', ({ roomCode, targetPlayerId, character }) => {
    if (!roomCode || !rooms[roomCode]) {
      return socket.emit('assign-character-error', { message: 'Комната не найдена' });
    }
    
    // Проверяем, началась ли игра
    if (!rooms[roomCode].gameStarted) {
      return socket.emit('assign-character-error', { message: 'Игра еще не началась' });
    }
    
    // Проверяем, назначен ли этот игрок для назначения персонажа указанному игроку
    if (rooms[roomCode].characterAssignments[socket.id] !== targetPlayerId) {
      return socket.emit('assign-character-error', { 
        message: 'Вы не можете назначить персонажа этому игроку' 
      });
    }
    
    // Назначаем персонажа
    rooms[roomCode].characters[targetPlayerId] = character;
    
    // Оповещаем игрока о назначенном ему персонаже
    io.to(targetPlayerId).emit('character-assigned', { character });
    
    // Обновляем информацию о комнате для всех
    io.to(roomCode).emit('room-updated', {
      ...rooms[roomCode],
      characters: rooms[roomCode].characters
    });
    
    console.log(`Игроку ${targetPlayerId} назначен персонаж: ${character}`);
  });
  
  // Получение списка игроков в комнате
  socket.on('get-players', ({ roomCode }) => {
    if (!roomCode || !rooms[roomCode]) {
      return socket.emit('get-players-error', { message: 'Комната не найдена' });
    }
    
    // Отправляем список игроков
    socket.emit('room-updated', rooms[roomCode]);
  });
  
  // Передача сигналов WebRTC между игроками
  socket.on('signal', ({ to, signal }) => {
    console.log(`Передача сигнала от ${socket.id} к ${to}`);
    io.to(to).emit('signal', { from: socket.id, signal });
  });
  
  // Обработка отключения игрока
  socket.on('disconnect', () => {
    console.log('Игрок отключился:', socket.id);
    
    // Находим все комнаты, где есть этот игрок
    for (const roomCode in rooms) {
      const room = rooms[roomCode];
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      
      // Если игрок найден в комнате
      if (playerIndex !== -1) {
        const wasHost = room.players[playerIndex].isHost;
        
        // Удаляем игрока из комнаты
        room.players.splice(playerIndex, 1);
        
        // Уведомляем всех оставшихся игроков
        io.to(roomCode).emit('player-left', socket.id);
        
        // Если в комнате не осталось игроков, удаляем ее
        if (room.players.length === 0) {
          delete rooms[roomCode];
          console.log(`Комната ${roomCode} удалена, т.к. в ней не осталось игроков`);
          continue;
        }
        
        // Если вышел хост, назначаем нового хоста
        if (wasHost && room.players.length > 0) {
          room.players[0].isHost = true;
        }
        
        // Обновляем состояние комнаты для всех оставшихся игроков
        io.to(roomCode).emit('room-updated', room);
      }
    }
  });
});

// Запуск сервера
const PORT = process.env.PORT || 3002;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
}); 