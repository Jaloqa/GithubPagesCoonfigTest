import React from 'react';
import styles from './GamePage.module.css';

const PlayerVideo = ({ player }) => {
  const { name, isHost } = player;
  const isMe = player.id === socketApi?.getSocketId?.();

  return (
    <div className={styles.videoAndControls}>
      <div className={styles.videoContainer}>
        <div className={styles.videoWrapper}>
          {/* Замена видео на заглушку */}
          <div className={styles.videoPlaceholder}>
            <span>Видео отключено</span>
          </div>
        </div>
        <div className={styles.playerLabel}>
          {name || player.playerName}
          {isMe && <span className={styles.meBadge}>Вы</span>}
          {isHost && <span className={styles.hostBadge}>Хост</span>}
        </div>
      </div>
    </div>
  );
};

export default PlayerVideo; 