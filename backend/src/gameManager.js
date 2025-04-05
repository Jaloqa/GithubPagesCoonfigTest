const { v4: uuidv4 } = require('uuid');

// Хранение информации о комнатах и игроках
const rooms = {}; // { roomId: { players: [], gameStarted: false, characterAssignments: {} } }

// Константы
const MAX_PLAYERS = 8;
const GAME_START_TIMEOUT = 30; // секунды
const ROOM_EXPIRE_TIME = 24 * 60 * 60 * 1000; // 24 часа

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
    this.rooms = {};
    this.startGameTimers = {};
  }

  // Создать новую комнату
  async createRoom(playerName) {
    const roomId = generateRoomCode();
    
    if (!rooms[roomId]) {
      rooms[roomId] = {
        players: [],
        gameStarted: false,
        characterAssignments: {},
        characters: {},
        created: Date.now(),
        startGameTimer: null,
        maxPlayers: MAX_PLAYERS
      };
    }
    
    // Добавляем игрока в комнату
    const playerId = `player_${Date.now()}`;
    rooms[roomId].players.push({
      id: playerId,
      name: playerName,
      isHost: true,
      lastActive: Date.now()
    });
    
    console.log(`Комната создана: ${roomId} игроком ${playerName}`);
    
    return {
      success: true,
      roomCode: roomId,
      playerId,
      isHost: true,
      maxPlayers: MAX_PLAYERS
    };
  }

  // Присоединиться к комнате
  async joinRoom(roomCode, playerName) {
    if (!rooms[roomCode]) {
      throw new Error('Комната не найдена');
    }
    
    if (rooms[roomCode].players.length >= rooms[roomCode].maxPlayers) {
      throw new Error('Комната заполнена');
    }
    
    if (rooms[roomCode].gameStarted) {
      throw new Error('Игра уже началась');
    }
    
    const playerId = `player_${Date.now()}`;
    rooms[roomCode].players.push({
      id: playerId,
      name: playerName,
      isHost: false,
      lastActive: Date.now()
    });
    
    console.log(`Игрок ${playerName} присоединился к комнате ${roomCode}`);
    
    return {
      success: true,
      roomCode,
      playerId,
      isHost: false,
      maxPlayers: rooms[roomCode].maxPlayers
    };
  }

  // Начать игру
  async startGame(roomCode) {
    const room = rooms[roomCode];
    if (!room) {
      throw new Error('Комната не найдена');
    }
    
    if (room.players.length < 2) {
      throw new Error('Для начала игры нужно минимум 2 игрока');
    }
    
    room.gameStarted = true;
    const playerIds = room.players.map(player => player.id);
    room.characterAssignments = assignCharacters(playerIds);
    
    // Очищаем таймер начала игры
    if (room.startGameTimer) {
      clearTimeout(room.startGameTimer);
      room.startGameTimer = null;
    }
    
    console.log(`Игра началась в комнате ${roomCode}`);
    
    return {
      success: true,
      gameStarted: true,
      characterAssignments: room.characterAssignments
    };
  }

  // Обновить активность игрока
  async updatePlayerActivity(roomCode, playerId) {
    const room = rooms[roomCode];
    if (!room) return false;
    
    const player = room.players.find(p => p.id === playerId);
    if (player) {
      player.lastActive = Date.now();
      return true;
    }
    return false;
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
      ...updates,
      lastActive: Date.now()
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
      characters: room.characters,
      maxPlayers: room.maxPlayers
    };
  }
  
  // Выход из комнаты
  async leaveRoom(roomCode, playerId) {
    const room = rooms[roomCode];
    if (!room) {
      throw new Error('Комната не найдена');
    }
    
    const playerIndex = room.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) {
      throw new Error('Игрок не найден');
    }
    
    const wasHost = room.players[playerIndex].isHost;
    room.players.splice(playerIndex, 1);
    
    // Если это был хост и остались игроки, назначаем нового хоста
    if (wasHost && room.players.length > 0) {
      room.players[0].isHost = true;
    }
    
    // Удаляем комнату, если она пуста
    if (room.players.length === 0) {
      delete rooms[roomCode];
      if (room.startGameTimer) {
        clearTimeout(room.startGameTimer);
      }
    }
    
    console.log(`Игрок ${playerId} покинул комнату ${roomCode}`);
    
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
      characters: room.characters,
      maxPlayers: room.maxPlayers
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
      ...playerState,
      lastActive: Date.now()
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
  
  // Очистка старых комнат
  cleanupRooms() {
    const now = Date.now();
    
    Object.keys(rooms).forEach(roomCode => {
      const room = rooms[roomCode];
      const roomAge = now - room.created;
      
      // Удаляем комнаты старше 24 часов
      if (roomAge > ROOM_EXPIRE_TIME) {
        if (room.startGameTimer) {
          clearTimeout(room.startGameTimer);
        }
        delete rooms[roomCode];
        console.log(`Комната ${roomCode} удалена из-за неактивности`);
      }
    });
  }
}

// Экспортируем синглтон
module.exports = new GameManager(); 