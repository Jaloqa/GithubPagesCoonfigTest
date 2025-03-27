import { BrowserRouter as Router } from 'react-router-dom'
import { AppRouter } from './providers/router'
import { Layout } from '../widgets/Layout'
import React from 'react'
import ApiTest from '../widgets/Layout/ApiTest'

function App() {
  return (
    <Router basename="/jaloqa.github.io">
      <Layout>
        <AppRouter />
        <ApiTest />
      </Layout>
    </Router>
  )
}

export default App 