import { v4 as uuidv4 } from 'uuid';

class GameManager {
  constructor() {
    // Хранилище комнат: { roomCode: Room }
    this.rooms = {};
  }

  // Создать новую комнату
  createRoom(hostId, hostName) {
    // Генерируем 6-символьный код комнаты (буквы и цифры)
    const roomCode = this.generateRoomCode();
    
    const room = {
      roomCode,
      hostId,
      players: [{ id: hostId, name: hostName, isHost: true, character: '', videoEnabled: false }],
      gameStarted: false,
      characterAssignments: {},
      created: new Date()
    };

    this.rooms[roomCode] = room;
    return roomCode;
  }

  // Сгенерировать код комнаты
  generateRoomCode() {
    // Генерируем 6-символьный альфа-цифровой код
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    // Проверяем, что код уникальный
    if (this.rooms[code]) {
      return this.generateRoomCode(); // Рекурсивно пробуем снова
    }
    
    return code;
  }

  // Присоединиться к комнате
  joinRoom(roomCode, playerId, playerName) {
    const room = this.rooms[roomCode];
    
    if (!room) {
      return { success: false, error: 'Комната не найдена' };
    }
    
    if (room.gameStarted) {
      return { success: false, error: 'Игра уже началась' };
    }
    
    // Проверяем, не присоединился ли этот игрок уже
    const existingPlayer = room.players.find(p => p.id === playerId);
    if (existingPlayer) {
      return { success: true, roomData: room };
    }
    
    // Добавляем игрока в комнату
    room.players.push({
      id: playerId,
      name: playerName,
      isHost: false,
      character: '',
      videoEnabled: false
    });
    
    return { success: true, roomData: room };
  }

  // Получить данные комнаты
  getRoom(roomCode) {
    return this.rooms[roomCode] || null;
  }
  
  // Обновить игрока в комнате
  updatePlayer(roomCode, playerId, updates) {
    const room = this.rooms[roomCode];
    if (!room) return false;
    
    const playerIndex = room.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return false;
    
    room.players[playerIndex] = {
      ...room.players[playerIndex],
      ...updates
    };
    
    return true;
  }
  
  // Установить персонажа для игрока
  setCharacter(roomCode, targetPlayerId, character) {
    const room = this.rooms[roomCode];
    if (!room) return false;
    
    const playerIndex = room.players.findIndex(p => p.id === targetPlayerId);
    if (playerIndex === -1) return false;
    
    room.players[playerIndex].character = character;
    return true;
  }
  
  // Начать игру
  startGame(roomCode) {
    const room = this.rooms[roomCode];
    if (!room) return false;
    
    // Генерируем случайные назначения персонажей
    room.characterAssignments = this.assignCharacters(room.players);
    room.gameStarted = true;
    
    return true;
  }
  
  // Функция для назначения, кто кому загадывает персонажа
  assignCharacters(players) {
    const assignments = {};
    
    // Создаем массив для перемешивания
    const playerIds = players.map(player => player.id);
    
    // Перемешиваем массив для случайного распределения
    for (let i = playerIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [playerIds[i], playerIds[j]] = [playerIds[j], playerIds[i]];
    }
    
    // Каждый игрок загадывает следующему в перемешанном массиве
    // Последний загадывает первому (кольцевое распределение)
    playerIds.forEach((playerId, index) => {
      // Следующий игрок по кругу
      const nextPlayerIndex = (index + 1) % playerIds.length;
      const nextPlayerId = playerIds[nextPlayerIndex];
      
      assignments[playerId] = nextPlayerId;
    });
    
    return assignments;
  }
  
  // Удалить игрока из комнаты
  removePlayer(roomCode, playerId) {
    const room = this.rooms[roomCode];
    if (!room) return false;
    
    const playerIndex = room.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return false;
    
    // Удаляем игрока
    room.players.splice(playerIndex, 1);
    
    // Если комната пуста, удаляем её
    if (room.players.length === 0) {
      delete this.rooms[roomCode];
      return true;
    }
    
    // Если ушёл хост, назначаем нового хоста
    if (room.players.every(p => !p.isHost) && room.players.length > 0) {
      room.players[0].isHost = true;
      room.hostId = room.players[0].id;
    }
    
    return true;
  }
  
  // Получить имя игрока по ID
  getPlayerName(roomCode, playerId) {
    const room = this.getRoom(roomCode);
    if (!room) return null;
    
    const player = room.players.find(p => p.id === playerId);
    return player ? player.name : null;
  }
  
  // Очистка старых комнат (для периодического вызова)
  cleanupRooms() {
    const now = new Date();
    const expireTime = 24 * 60 * 60 * 1000; // 24 часа в миллисекундах
    
    Object.keys(this.rooms).forEach(roomCode => {
      const room = this.rooms[roomCode];
      const roomAge = now - room.created;
      
      // Удаляем комнаты старше 24 часов
      if (roomAge > expireTime) {
        delete this.rooms[roomCode];
      }
    });
  }
}

// Экспортируем синглтон
export default new GameManager(); 