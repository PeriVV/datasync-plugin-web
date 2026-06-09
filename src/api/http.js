import axios from 'axios'

const backendTarget = import.meta.env.VITE_PROXY_TARGET || import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8080'

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15000,
})

function responseMessage(data) {
  if (data && typeof data === 'object') return String(data.message || data.error || '').trim()
  if (typeof data !== 'string') return ''
  try {
    const parsed = JSON.parse(data)
    return String(parsed?.message || parsed?.error || '').trim()
  } catch {
    return data.trim()
  }
}

function isTechnicalMessage(message) {
  return /request failed|status code|network error|timeout|exception|stack trace|sqlstate|jdbc|axios|econn|enotfound|unknown column|doesn't exist|communications link failure|connection refused|classnotfound|com\.mysql|java\.|org\./i.test(message)
}

export function userFacingMessage(message, fallback = '操作失败，请检查填写内容后重试') {
  const text = String(message || '').trim()
  return text && !isTechnicalMessage(text) ? text : fallback
}

function friendlyErrorMessage(error) {
  if (!error.response) {
    return `无法连接后端服务，请确认服务已启动并监听 ${backendTarget}`
  }
  const status = Number(error.response.status || 0)
  const serverMessage = responseMessage(error.response.data)
  if (status >= 500) {
    return serverMessage || '服务处理失败，请稍后重试或联系管理员'
  }
  if (status === 400) {
    return userFacingMessage(serverMessage, '请求内容不正确，请检查必填字段和相关配置')
  }
  if (status === 401) return '登录状态已失效，请重新登录'
  if (status === 403) return '当前账号无权执行此操作'
  if (status === 404) return '请求的数据或服务不存在'
  if (status === 409) return '当前数据已发生变化，请刷新后重试'
  if (serverMessage) return userFacingMessage(serverMessage)
  return '操作失败，请检查填写内容后重试'
}

http.interceptors.response.use(
  (response) => response,
  (error) => {
    error.message = friendlyErrorMessage(error)
    return Promise.reject(error)
  },
)

export default http
