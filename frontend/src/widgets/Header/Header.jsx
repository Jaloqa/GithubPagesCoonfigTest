import React from 'react';
import styles from './Header.module.css';

export const Header = () => {
  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <h1>Моё приложение</h1>
        <nav>
          <ul className={styles.navList}>
            <li><a href="/">Главная</a></li>
            <li><a href="/about">О нас</a></li>
          </ul>
        </nav>
      </div>
    </header>
  );
}; 