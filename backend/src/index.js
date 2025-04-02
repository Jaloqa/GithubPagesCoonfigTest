const express = require('express');
const cors = require('cors');
const gameManager = require('./gameManager');
const mediaManager = require('./mediaManager');

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(express.json());
app.use(cors({
  origin: ['http://localhost:3000', 'https://jaloqa.github.io'],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-vercel-protection-bypass']
}));

// Middleware для проверки заголовка защиты Vercel
const checkVercelProtection = (req, res, next) => {
  const bypassHeader = req.headers['x-vercel-protection-bypass'];
  if (bypassHeader !== 'ODjj85wkLvMNdHMyTmekRQjzuLoPNBFw') {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  next();
};

// Применяем проверку защиты ко всем маршрутам
app.use(checkVercelProtection);

// Создание комнаты
app.post('/api/rooms/create', async (req, res) => {
  try {
    const { playerName } = req.body;
    const room = await gameManager.createRoom(playerName);
    res.json(room);
  } catch (error) {
    console.error('Ошибка при создании комнаты:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// Присоединение к комнате
app.post('/api/rooms/join', async (req, res) => {
  try {
    const { roomCode, playerName } = req.body;
    const result = await gameManager.joinRoom(roomCode, playerName);
    res.json(result);
  } catch (error) {
    console.error('Ошибка при присоединении к комнате:', error);
    res.status(500).json({ error: 'Failed to join room' });
  }
});

// Начало игры
app.post('/api/games/start', async (req, res) => {
  try {
    const { roomCode } = req.body;
    const result = await gameManager.startGame(roomCode);
    res.json(result);
  } catch (error) {
    console.error('Ошибка при начале игры:', error);
    res.status(500).json({ error: 'Failed to start game' });
  }
});

// Получение списка игроков в комнате
app.get('/api/rooms/:roomCode/players', async (req, res) => {
  try {
    const { roomCode } = req.params;
    const players = await gameManager.getPlayers(roomCode);
    res.json(players);
  } catch (error) {
    console.error('Ошибка при получении списка игроков:', error);
    res.status(500).json({ error: 'Failed to get players' });
  }
});

// Установка персонажа для игрока
app.post('/api/players/character', async (req, res) => {
  try {
    const { roomCode, targetPlayerId, character } = req.body;
    const result = await gameManager.setCharacter(roomCode, targetPlayerId, character);
    res.json(result);
  } catch (error) {
    console.error('Ошибка при установке персонажа:', error);
    res.status(500).json({ error: 'Failed to set character' });
  }
});

// Выход из комнаты
app.post('/api/rooms/:roomCode/leave', async (req, res) => {
  try {
    const { roomCode } = req.params;
    await gameManager.leaveRoom(roomCode);
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка при выходе из комнаты:', error);
    res.status(500).json({ error: 'Failed to leave room' });
  }
});

// Получение состояния комнаты
app.get('/api/rooms/:roomCode/state', async (req, res) => {
  try {
    const { roomCode } = req.params;
    const state = await gameManager.getRoomState(roomCode);
    res.json(state);
  } catch (error) {
    console.error('Ошибка при получении состояния комнаты:', error);
    res.status(500).json({ error: 'Failed to get room state' });
  }
});

// Обновление состояния игрока
app.post('/api/rooms/:roomCode/player-state', async (req, res) => {
  try {
    const { roomCode } = req.params;
    const playerState = req.body;
    const result = await gameManager.updatePlayerState(roomCode, playerState);
    res.json(result);
  } catch (error) {
    console.error('Ошибка при обновлении состояния игрока:', error);
    res.status(500).json({ error: 'Failed to update player state' });
  }
});

// Обработка ошибок
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something broke!' });
});

// Запуск сервера
app.listen(port, () => {
  console.log(`Сервер запущен на порту ${port}`);
});