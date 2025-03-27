import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Базовый маршрут
app.get('/', (req, res) => {
  res.json({ message: 'Добро пожаловать в API Jaloqa!' });
});


app.get("/", (req, res) => {
  res.json({ message: "Привет, это Backend на Vercel!" });
});
// Здесь будут другие маршруты

app.listen(port, () => {
  console.log(`Сервер запущен на порту ${port}`);
}); 

module.exports = app;