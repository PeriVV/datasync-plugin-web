import axios from 'axios'

const backendTarget = import.meta.env.VITE_PROXY_TARGET || import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8080'

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15000,
})

http.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!error.response) {
      error.message = `后端服务连接失败，请确认服务已启动并监听 ${backendTarget}`
    } else if (error.response.status >= 500 && String(error.response.data || '').includes('proxy')) {
      error.message = `后端服务连接失败，请确认服务已启动并监听 ${backendTarget}`
    }
    return Promise.reject(error)
  },
)

export default http
