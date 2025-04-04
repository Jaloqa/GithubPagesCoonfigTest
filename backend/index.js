const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors({
  origin: 'https://jaloqa.github.io',
  credentials: true
}));

app.use(express.json());

const rooms = new Map();

wss.on('connection', (ws) => {
  console.log('New WebSocket connection');

  ws.on('message', (message) => {
    try {
      const { type, data } = JSON.parse(message);
      handleMessage(ws, type, data);
    } catch (error) {
      console.error('Error parsing message:', error);
      ws.send(JSON.stringify({ type: 'error', data: { message: 'Invalid message format' } }));
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    handleDisconnect(ws);
  });
});

function handleMessage(ws, type, data) {
  switch (type) {
    case 'create-room':
      handleCreateRoom(ws, data);
      break;
    case 'join-room':
      handleJoinRoom(ws, data);
      break;
    case 'start-game':
      handleStartGame(ws, data);
      break;
    case 'get-players':
      handleGetPlayers(ws, data);
      break;
    case 'set-character':
      handleSetCharacter(ws, data);
      break;
    case 'leave-room':
      handleLeaveRoom(ws, data);
      break;
    case 'get-room-state':
      handleGetRoomState(ws, data);
      break;
    case 'update-player-state':
      handleUpdatePlayerState(ws, data);
      break;
    default:
      ws.send(JSON.stringify({ type: 'error', data: { message: 'Unknown message type' } }));
  }
}

function handleCreateRoom(ws, data) {
  const { playerName } = data;
  const roomCode = uuidv4().substring(0, 6).toUpperCase();
  const room = {
    code: roomCode,
    host: playerName,
    players: new Map(),
    gameStarted: false
  };
  room.players.set(playerName, { id: playerName, name: playerName, online: true });
  rooms.set(roomCode, room);
  ws.roomCode = roomCode;
  ws.playerName = playerName;
  broadcastRoomState(roomCode);
  ws.send(JSON.stringify({ type: 'room-created', data: { roomCode } }));
}

function handleJoinRoom(ws, data) {
  const { roomCode, playerName } = data;
  const room = rooms.get(roomCode);
  
  if (!room) {
    ws.send(JSON.stringify({ type: 'error', data: { message: 'Room not found' } }));
    return;
  }

  if (room.players.has(playerName)) {
    ws.send(JSON.stringify({ type: 'error', data: { message: 'Player name already taken' } }));
    return;
  }

  room.players.set(playerName, { id: playerName, name: playerName, online: true });
  ws.roomCode = roomCode;
  ws.playerName = playerName;
  broadcastRoomState(roomCode);
  ws.send(JSON.stringify({ type: 'room-joined', data: { success: true } }));
}

function handleStartGame(ws, data) {
  const { roomCode } = data;
  const room = rooms.get(roomCode);
  
  if (!room || room.host !== ws.playerName) {
    ws.send(JSON.stringify({ type: 'error', data: { message: 'Not authorized' } }));
    return;
  }

  room.gameStarted = true;
  broadcastRoomState(roomCode);
  broadcastToRoom(roomCode, { type: 'game-started', data: {} });
}

function handleGetPlayers(ws, data) {
  const { roomCode } = data;
  const room = rooms.get(roomCode);
  
  if (!room) {
    ws.send(JSON.stringify({ type: 'error', data: { message: 'Room not found' } }));
    return;
  }

  ws.send(JSON.stringify({
    type: 'players',
    data: Array.from(room.players.values())
  }));
}

function handleSetCharacter(ws, data) {
  const { roomCode, targetPlayerId, character } = data;
  const room = rooms.get(roomCode);
  
  if (!room || room.host !== ws.playerName) {
    ws.send(JSON.stringify({ type: 'error', data: { message: 'Not authorized' } }));
    return;
  }

  const player = room.players.get(targetPlayerId);
  if (player) {
    player.character = character;
    broadcastRoomState(roomCode);
    broadcastToRoom(roomCode, {
      type: 'character-set',
      data: { playerId: targetPlayerId, character }
    });
  }
}

function handleLeaveRoom(ws, data) {
  const { roomCode } = data;
  const room = rooms.get(roomCode);
  
  if (room) {
    room.players.delete(ws.playerName);
    if (room.players.size === 0) {
      rooms.delete(roomCode);
    } else if (room.host === ws.playerName) {
      room.host = Array.from(room.players.keys())[0];
    }
    broadcastRoomState(roomCode);
    broadcastToRoom(roomCode, {
      type: 'player-left',
      data: { playerName: ws.playerName }
    });
  }
}

function handleGetRoomState(ws, data) {
  const { roomCode } = data;
  const room = rooms.get(roomCode);
  
  if (!room) {
    ws.send(JSON.stringify({ type: 'error', data: { message: 'Room not found' } }));
    return;
  }

  ws.send(JSON.stringify({
    type: 'room-state',
    data: {
      code: room.code,
      host: room.host,
      players: Array.from(room.players.values()),
      gameStarted: room.gameStarted
    }
  }));
}

function handleUpdatePlayerState(ws, data) {
  const { roomCode, playerState } = data;
  const room = rooms.get(roomCode);
  
  if (room) {
    const player = room.players.get(ws.playerName);
    if (player) {
      Object.assign(player, playerState);
      broadcastRoomState(roomCode);
    }
  }
}

function handleDisconnect(ws) {
  if (ws.roomCode) {
    const room = rooms.get(ws.roomCode);
    if (room) {
      const player = room.players.get(ws.playerName);
      if (player) {
        player.online = false;
        broadcastRoomState(ws.roomCode);
        broadcastToRoom(ws.roomCode, {
          type: 'player-left',
          data: { playerName: ws.playerName }
        });
      }
    }
  }
}

function broadcastRoomState(roomCode) {
  const room = rooms.get(roomCode);
  if (room) {
    broadcastToRoom(roomCode, {
      type: 'room-state',
      data: {
        code: room.code,
        host: room.host,
        players: Array.from(room.players.values()),
        gameStarted: room.gameStarted
      }
    });
  }
}

function broadcastToRoom(roomCode, message) {
  wss.clients.forEach((client) => {
    if (client.roomCode === roomCode && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 