import http from './http'

const useMock = import.meta.env.VITE_USE_MOCK === 'true'

const mockSources = [
  {
    id: 'center',
    name: '中心库',
    type: 'MYSQL',
    url: 'jdbc:mysql://127.0.0.1:3306/datasync_center?useSSL=false&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true',
    username: 'root',
    ok: true,
    message: '连接正常',
  },
  {
    id: 'node',
    name: '节点库',
    type: 'MYSQL',
    url: 'jdbc:mysql://127.0.0.1:3306/datasync_node?useSSL=false&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true',
    username: 'root',
    ok: true,
    message: '连接正常',
  },
]

const mockTables = [
  { tableName: 'zy_task' },
  { tableName: 'set_calc_param' },
  { tableName: 'zy_file_new' },
  { tableName: 'zy_dict' },
]

function simulate(data) {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(data), 260)
  })
}

function normalizeType(type) {
  return String(type || '').replace(/\/+$/, '').toUpperCase()
}

function buildParams(source = {}) {
  const params = {}
  if (source.id !== undefined && source.id !== null && String(source.id).trim()) {
    params.id = source.id
  }
  if (source.name && String(source.name).trim()) {
    params.name = source.name
  }
  return params
}

export async function listDataSources() {
  if (useMock) {
    return simulate(mockSources)
  }
  const { data } = await http.get('/datasources/list')
  return data
}

export async function connectDataSource(type, payload) {
  if (useMock) {
    return simulate({
      ...payload,
      id: payload.id || `${normalizeType(type).toLowerCase()}-${Date.now()}`,
      type: normalizeType(type),
      ok: true,
      success: true,
      message: '连接已保存',
    })
  }
  const { data } = await http.post(`/datasources/${normalizeType(type)}/connect`, payload)
  return data
}

export async function testDataSource(type, payload) {
  if (useMock) {
    return simulate({ success: true, ok: true, type: normalizeType(type), message: '连接成功' })
  }
  const { data } = await http.post(`/datasources/${normalizeType(type)}/test`, payload)
  return data
}

export async function fetchDataSourceStatus(source) {
  if (useMock) {
    return simulate({ ...source, ok: true, message: '连接正常' })
  }
  const { data } = await http.get(`/datasources/${normalizeType(source.type)}/status`, {
    params: buildParams(source),
  })
  return data
}

export async function fetchDataSourceInfo(source) {
  if (useMock) {
    return simulate(source)
  }
  const { data } = await http.get(`/datasources/${normalizeType(source.type)}/info`, {
    params: buildParams(source),
  })
  return data
}

export async function deleteDataSource(source) {
  if (useMock) {
    return simulate({ success: true, id: source.id })
  }
  const { data } = await http.delete(`/datasources/${normalizeType(source.type)}`, {
    params: buildParams(source),
  })
  return data
}

export async function listTables(source) {
  if (useMock) {
    return simulate(mockTables)
  }
  const { data } = await http.get(`/datasources/${normalizeType(source.type)}/tables`, {
    params: buildParams(source),
  })
  return data
}

export async function previewTableRows(source, table, page = 1, size = 20) {
  if (useMock) {
    return simulate({
      success: true,
      page,
      size,
      columns: ['id', 'task_id', 'name', 'create_time'],
      rows: [
        { id: '1001', task_id: 'T-100', name: `${table} 记录 1`, create_time: '2026-01-01 09:00:00' },
        { id: '1002', task_id: 'T-100', name: `${table} 记录 2`, create_time: '2026-01-01 09:05:00' },
      ],
    })
  }
  const { data } = await http.get(
    `/datasources/${normalizeType(source.type)}/tables/${encodeURIComponent(table)}/rows`,
    {
      params: {
        ...buildParams(source),
        page,
        size,
      },
    },
  )
  return data
}
