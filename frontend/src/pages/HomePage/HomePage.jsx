import React from 'react';
import styles from './HomePage.module.css';

export const HomePage = () => {
  return (
    <div className={styles.homePage}>
      <h1>Добро пожаловать на домашнюю страницу!</h1>
      <p>Это пример домашней страницы вашего приложения.</p>
      <div className={styles.sections}>
        <section className={styles.section}>
          <h2>О нас</h2>
          <p>Мы разрабатываем лучшие приложения для наших клиентов.</p>
        </section>
        <section className={styles.section}>
          <h2>Услуги</h2>
          <p>Разработка, дизайн, поддержка и многое другое.</p>
        </section>
      </div>
    </div>
  );
};
