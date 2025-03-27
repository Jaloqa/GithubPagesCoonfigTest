import express from 'express';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 3001;

// Настройка CORS - разрешаем запросы со всех доменов
app.use(cors({
  origin: '*',  // Разрешаем запросы с любого домена
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: false
}));

app.use(express.json());

// Тестовый маршрут
app.get('/', (req, res) => {
  res.json({ message: 'Соединение с бэкендом успешно установлено!' });
});

// Обработка ошибок
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Что-то пошло не так!' });
});

app.listen(port, () => {
  console.log(`Сервер запущен на порту ${port}`);
});

export default app;