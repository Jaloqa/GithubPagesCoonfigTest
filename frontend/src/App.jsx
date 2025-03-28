import { BrowserRouter as Router } from 'react-router-dom'
import { AppRouter } from './app/providers/router/AppRouter'
import { Layout } from './widgets/Layout/Layout'
import React from 'react'

function App() {
  return (
    <Router basename="/GithubPagesCoonfigTest">
      <Layout>
        <AppRouter />
      </Layout>
    </Router>
  )
}

export default App 