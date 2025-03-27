# Jaloqa Website

Полнофункциональное веб-приложение с React фронтендом и Node.js бэкендом.

## Структура проекта

```
jaloqa.github.io/
├── frontend/     # React приложение (Vite)
├── backend/      # Node.js API сервер
└── package.json  # Корневой package.json для управления проектом
```

## Установка

1. Клонируйте репозиторий:
```bash
git clone https://github.com/jaloqa/jaloqa.github.io.git
cd jaloqa.github.io
```

2. Установите зависимости:
```bash
npm run install:all
```

## Разработка

Запустите оба сервера (фронтенд и бэкенд) одновременно:
```bash
npm run dev
```

Или запустите их по отдельности:
```bash
npm run frontend  # Запуск только фронтенда
npm run backend   # Запуск только бэкенда
```

## Деплой

Для деплоя на GitHub Pages:
```bash
npm run deploy
``` 