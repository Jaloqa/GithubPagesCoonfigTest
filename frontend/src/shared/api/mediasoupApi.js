import socketApi from './socketApi';

class MediasoupApi {
  constructor() {
    this.initialized = false;
    this.roomId = null;
    this.onTrackCallbacks = new Map();
  }

  // Заглушка для инициализации
  async init(roomId) {
    console.log('MediasoupApi: инициализация отключена');
    this.roomId = roomId;
    this.initialized = true;
    return true;
  }

  // Заглушка для получения локального потока
  async getLocalStream() {
    console.log('MediasoupApi: получение локального потока отключено');
    return null;
  }

  // Заглушка для публикации потока
  async publishStream() {
    console.log('MediasoupApi: публикация потока отключена');
    return true;
  }

  // Заглушка для установки колбэка на получение трека
  setOnTrackCallback(peerId, callback) {
    this.onTrackCallbacks.set(peerId, callback);
  }

  // Заглушка для обновления состояния потока
  async updateStreamStatus() {
    console.log('MediasoupApi: обновление статуса медиа отключено');
    return true;
  }

  // Вспомогательная функция для отправки запросов на сервер
  async request(type, data = {}) {
    return new Promise((resolve) => {
      try {
        socketApi.emit(type, data, (response) => {
          if (!response) {
            console.warn(`Пустой ответ от сервера для запроса ${type}`);
            resolve({});
            return;
          }
          resolve(response);
        });
      } catch (error) {
        console.error(`Ошибка при выполнении запроса ${type}:`, error);
        resolve({ error: error.message || 'Неизвестная ошибка при отправке запроса' });
      }
    });
  }

  // Очистка ресурсов
  cleanup() {
    console.log('MediasoupApi: очистка ресурсов');
    this.initialized = false;
    this.roomId = null;
    this.onTrackCallbacks.clear();
  }
}

const mediasoupApi = new MediasoupApi();
export default mediasoupApi; 