import React from 'react';
import { HomePage } from '@/pages/HomePage';
import { GamePage } from '@/pages/GamePage';

export const routeConfig = {
  main: {
    path: '/',
    element: <HomePage />
  },
  game: {
    path: '/game',
    element: <GamePage />
  }
};
