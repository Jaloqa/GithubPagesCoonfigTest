import { Routes, Route } from 'react-router-dom'
import { HomePage } from '../../../pages/HomePage'
import { AboutPage } from '../../../pages/AboutPage'
import { ProjectsPage } from '../../../pages/ProjectsPage'
import { ServicesPage } from '../../../pages/ServicesPage'
import { ContactPage } from '../../../pages/ContactPage'

export const AppRouter = () => {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/projects" element={<ProjectsPage />} />
      <Route path="/services" element={<ServicesPage />} />
      <Route path="/contact" element={<ContactPage />} />
    </Routes>
  )
} 