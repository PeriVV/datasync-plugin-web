import http from './http'

const useMock = import.meta.env.VITE_USE_MOCK === 'true'

const mockProfiles = [
  { name: 'zy_all_new.json', path: 'config/table-profiles/zy_all_new.json' },
]

const mockExportPlans = [
  { name: 'zy-full-database.json', path: 'config/export-plans/zy-full-database.json' },
  { name: 'zy-task-1897251927373348866.json', path: 'config/export-plans/zy-task-1897251927373348866.json' },
]

function simulate(data) {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(data), 220)
  })
}

export async function listTableProfiles() {
  if (useMock) {
    return simulate(mockProfiles)
  }
  const { data } = await http.get('/config/table-profiles')
  return data
}

export async function fetchTableProfile(name) {
  if (useMock) {
    return simulate({
      name: 'zy_all_new',
      detectTables: ['zy_task'],
      autoTaskTables: [],
      syncTables: [],
      backupTables: [],
      _fileName: name,
    })
  }
  const { data } = await http.get(`/config/table-profiles/${encodeURIComponent(name)}`)
  return data
}

export async function saveTableProfile(name, profile) {
  if (useMock) {
    return simulate({ success: true, name })
  }
  const { data } = await http.put(`/config/table-profiles/${encodeURIComponent(name)}`, profile)
  return data
}

export async function listExportPlans() {
  if (useMock) {
    return simulate(mockExportPlans)
  }
  const { data } = await http.get('/config/export-plans')
  return data
}

export async function fetchExportPlan(name) {
  if (useMock) {
    return simulate({
      name: 'zy-full-database',
      displayName: 'zy项目全量导出',
      profile: 'zy_all_new.json',
      scopeMode: 'FULL_DATABASE',
      autoScopeEnabled: false,
      taskIds: [],
      manualScopes: [],
      context: {},
      _fileName: name,
    })
  }
  const { data } = await http.get(`/config/export-plans/${encodeURIComponent(name)}`)
  return data
}

export async function saveExportPlan(name, plan) {
  if (useMock) {
    return simulate({ success: true, name })
  }
  const { data } = await http.put(`/config/export-plans/${encodeURIComponent(name)}`, plan)
  return data
}
