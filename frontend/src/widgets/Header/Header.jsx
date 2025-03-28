import React from 'react';
import { Link } from 'react-router-dom';
import styles from './Header.module.css';

export const Header = () => {
  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <Link to="/" className={styles.logo}>
          <span className={styles.icon}>📋</span>
          <span className={styles.text}>Who Am I?</span>
        </Link>
        
        <div className={styles.actions}>
          <button className={styles.connectButton}>Connect</button>
          <Link to="/" className={styles.createButton}>Create</Link>
        </div>
      </div>
    </header>
  );
}; 