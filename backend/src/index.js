import express from 'express';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 3001;

// Настройка CORS для вашего фронтенда на GitHub Pages
app.use(cors({
  origin: 'https://jaloqa.github.io/GithubPagesCoonfigTest',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
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