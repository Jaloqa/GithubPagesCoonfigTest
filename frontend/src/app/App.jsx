import { BrowserRouter as Router } from 'react-router-dom'
import { AppRouter } from './providers/router'
import { Layout } from '../widgets/Layout'

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