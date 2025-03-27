import { BrowserRouter as Router } from 'react-router-dom'
import { AppRouter } from './app/providers/router/AppRouter'
import { Layout } from './widgets/Layout/Layout'
import React from 'react'
import ApiTest from './widgets/Layout/ApiTest'

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