import React, { useState } from 'react';

const ApiTest = () => {
  const [response, setResponse] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [apiUrl, setApiUrl] = useState('https://github-pages-coonfig-test.vercel.app');

  const testConnection = async () => {
    setIsLoading(true);
    setError('');
    setResponse('');

    try {
      console.log('Пытаемся подключиться к:', apiUrl);
      
      // Прямое использование fetch с полными настройками CORS
      const res = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Content-Type': 'application/json',
        },
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-cache',
        redirect: 'follow',
      });
      
      if (!res.ok) {
        throw new Error(`HTTP ошибка! Статус: ${res.status}`);
      }
      
      const data = await res.text();
      setResponse(data);
      console.log('Ответ от сервера:', data);
    } catch (err) {
      console.error('Ошибка подключения:', err);
      setError('Ошибка подключения к серверу: ' + err.message);
      
      // Добавляем альтернативный метод для проверки
      try {
        // Можно попробовать использовать JSON-P для обхода CORS
        console.log('Пробуем альтернативный метод подключения...');
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(apiUrl)}`;
        const proxyRes = await fetch(proxyUrl);
        const proxyData = await proxyRes.json();
        
        if (proxyData && proxyData.contents) {
          setResponse(proxyData.contents);
          setError('');
          console.log('Ответ от прокси-сервера:', proxyData.contents);
        }
      } catch (proxyErr) {
        console.error('Ошибка альтернативного подключения:', proxyErr);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleApiUrlChange = (e) => {
    setApiUrl(e.target.value);
  };

  return (
    <div style={{ padding: '20px', maxWidth: '500px', margin: '0 auto' }}>
      <h2>Проверка связи с сервером</h2>
      
      <div style={{ marginBottom: '15px' }}>
        <label htmlFor="apiUrl" style={{ display: 'block', marginBottom: '5px' }}>URL API:</label>
        <input 
          id="apiUrl"
          type="text" 
          value={apiUrl} 
          onChange={handleApiUrlChange} 
          style={{ 
            width: '100%', 
            padding: '8px', 
            borderRadius: '4px', 
            border: '1px solid #ccc' 
          }}
        />
      </div>
      
      <button 
        onClick={testConnection}
        disabled={isLoading}
        style={{
          padding: '10px 20px',
          fontSize: '16px',
          backgroundColor: '#4CAF50',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          marginBottom: '20px'
        }}
      >
        {isLoading ? 'Проверяем...' : 'Проверить соединение'}
      </button>

      {error && (
        <div style={{ 
          padding: '10px', 
          backgroundColor: '#ffebee', 
          color: '#c62828',
          borderRadius: '4px',
          marginBottom: '10px'
        }}>
          {error}
        </div>
      )}

      {response && (
        <div style={{ 
          padding: '10px', 
          backgroundColor: '#e8f5e9', 
          color: '#2e7d32',
          borderRadius: '4px'
        }}>
          Ответ сервера: {response}
        </div>
      )}
    </div>
  );
};

export default ApiTest;
