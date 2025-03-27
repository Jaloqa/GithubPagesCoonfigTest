import { useState } from 'react'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
      <div className="container">
        <h1>Привет, мир!</h1>
        <div className="card">
          <button onClick={() => setCount((count) => count + 1)}>
            Счетчик: {count}
          </button>
        </div>
      </div>
    </>
  )
}

export default App 