const { v4: uuidv4 } = require('uuid');

// Хранение информации о комнатах и игроках
const rooms = {}; // { roomId: { players: [], gameStarted: false, characterAssignments: {} } }

// Генерация кода комнаты (4 символов)
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
  for (let i = 0; i < playerIds.length; i++) {
    const currentPlayerId = playerIds[i];
    const targetPlayerId = playerIds[(i + 1) % playerIds.length];
    assignments[currentPlayerId] = targetPlayerId;
  }
  return assignments;
}

class GameManager {
  constructor() {
    // Хранилище комнат: { roomCode: Room }
    this.rooms = {};
  }

  // Создать новую комнату
  async createRoom(playerName) {
    const roomId = generateRoomCode();
    
    if (!rooms[roomId]) {
      rooms[roomId] = {
        players: [],
        gameStarted: false,
        characterAssignments: {},
        characters: {}
      };
    }
    
    // Добавляем игрока в комнату
    const playerId = `player_${Date.now()}`;
    rooms[roomId].players.push({
      id: playerId,
      name: playerName,
      isHost: true
    });
    
    console.log(`Комната создана: ${roomId} игроком ${playerName}`);
    
    return {
      success: true,
      roomCode: roomId,
      playerId,
      isHost: true
    };
  }

  // Присоединиться к комнате
  async joinRoom(roomCode, playerName) {
    if (!rooms[roomCode]) {
      throw new Error('Комната не найдена');
    }
    
    const playerId = `player_${Date.now()}`;
    rooms[roomCode].players.push({
      id: playerId,
      name: playerName,
      isHost: false
    });
    
    console.log(`Игрок ${playerName} присоединился к комнате ${roomCode}`);
    
    return {
      success: true,
      roomCode,
      playerId,
      isHost: false
    };
  }

  // Начать игру
  async startGame(roomCode) {
    const room = rooms[roomCode];
    if (!room) {
      throw new Error('Комната не найдена');
    }
    
    room.gameStarted = true;
    const playerIds = room.players.map(player => player.id);
    room.characterAssignments = assignCharacters(playerIds);
    
    console.log(`Игра началась в комнате ${roomCode}`);
    
    return {
      success: true,
      gameStarted: true,
      characterAssignments: room.characterAssignments
    };
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
  async setCharacter(roomCode, targetPlayerId, character) {
    const room = rooms[roomCode];
    if (!room) {
      throw new Error('Комната не найдена');
    }
    
    if (!room.gameStarted) {
      throw new Error('Игра еще не началась');
    }
    
    if (!room.characters) {
      room.characters = {};
    }
    
    room.characters[targetPlayerId] = character;
    
    console.log(`Персонаж "${character}" назначен игроку в комнате ${roomCode}`);
    
    return {
      success: true,
      character,
      targetPlayerId
    };
  }
  
  // Получить список игроков
  async getPlayers(roomCode) {
    const room = rooms[roomCode];
    if (!room) {
      throw new Error('Комната не найдена');
    }
    
    return {
      players: room.players,
      gameStarted: room.gameStarted,
      characterAssignments: room.characterAssignments,
      characters: room.characters
    };
  }
  
  // Выход из комнаты
  async leaveRoom(roomCode) {
    const room = rooms[roomCode];
    if (!room) {
      throw new Error('Комната не найдена');
    }
    
    // Удаляем комнату, если она пуста
    if (room.players.length <= 1) {
      delete rooms[roomCode];
    } else {
      // Если это был хост, назначаем нового
      const playerIndex = room.players.findIndex(p => p.id === room.hostId);
      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1);
        room.hostId = room.players[0].id;
        room.players[0].isHost = true;
      }
    }
    
    console.log(`Игрок покинул комнату ${roomCode}`);
    
    return { success: true };
  }
  
  // Получить состояние комнаты
  async getRoomState(roomCode) {
    const room = rooms[roomCode];
    if (!room) {
      throw new Error('Комната не найдена');
    }
    
    return {
      players: room.players,
      gameStarted: room.gameStarted,
      characterAssignments: room.characterAssignments,
      characters: room.characters
    };
  }
  
  // Обновление состояния игрока
  async updatePlayerState(roomCode, playerState) {
    const room = rooms[roomCode];
    if (!room) {
      throw new Error('Комната не найдена');
    }
    
    const playerIndex = room.players.findIndex(p => p.id === playerState.id);
    if (playerIndex === -1) {
      throw new Error('Игрок не найден');
    }
    
    room.players[playerIndex] = {
      ...room.players[playerIndex],
      ...playerState
    };
    
    return {
      success: true,
      player: room.players[playerIndex]
    };
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
module.exports = new GameManager(); 