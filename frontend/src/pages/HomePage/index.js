import axios from 'axios'

export const API_URL = import.meta.env.VITE_API_URL || '/api'

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Add interceptors if needed
api.interceptors.request.use((config) => {
  // Add auth token or other headers here
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle errors here
    return Promise.reject(error)
  }
)

export { HomePage } from './HomePage'; 