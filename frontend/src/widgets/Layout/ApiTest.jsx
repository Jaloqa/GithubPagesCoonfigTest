import React, { useState } from 'react';

const ApiTest = () => {
  const [response, setResponse] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const testConnection = async () => {
    setIsLoading(true);
    setError('');
    setResponse('');

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'https://jaloqa-j26gkd75f-jaloqas-projects.vercel.app';
      const res = await fetch(apiUrl);
      const data = await res.text();
      setResponse(data);
    } catch (err) {
      setError('Ошибка подключения к серверу: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '500px', margin: '0 auto' }}>
      <h2>Проверка связи с сервером</h2>
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
