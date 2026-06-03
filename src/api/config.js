import http from './http'

const useMock = import.meta.env.VITE_USE_MOCK === 'true'

let mockProfiles = [
  { name: 'zy_all_new.json', path: 'config/table-profiles/zy_all_new.json' },
  { name: 'dm_sample_profile.json', path: 'config/table-profiles/dm_sample_profile.json' },
]

const mockTableProfiles = {
  'zy_all_new.json': {
    name: 'zy_all_new',
    dataSource: null,
    detectTables: ['zy_task'],
    autoTaskTables: [
      {
        tableName: 'zy_task',
        keyColumn: 'id',
        taskConditionTemplate: "task_id = '${taskId}'",
        fileTable: false,
        fileColumn: null,
        filePathTemplate: null,
        dependencyOrder: 0,
      },
      {
        tableName: 'set_calc_param',
        keyColumn: 'id',
        taskConditionTemplate: "task_id = '${taskId}'",
        fileTable: false,
        fileColumn: null,
        filePathTemplate: null,
        dependencyOrder: 10,
      },
      {
        tableName: 'zy_file_new',
        keyColumn: 'id',
        taskConditionTemplate: "task_id = '${taskId}'",
        fileTable: true,
        fileColumn: 'relative_path',
        filePathTemplate: null,
        dependencyOrder: 20,
      },
    ],
    backupTables: [],
  },
  'dm_sample_profile.json': {
    name: 'dm_sample_profile',
    dataSource: {
      id: 'dm8-sample',
      type: 'DM8',
      name: 'DM8 示例库',
      url: 'jdbc:dm://127.0.0.1:5236?SCHEMA=DATASYNC_SAMPLE&LOGINMODE=4',
    },
    detectTables: ['DS_TASK', 'DS_TASK_DETAIL'],
    autoTaskTables: [
      {
        tableName: 'DS_TASK',
        keyColumn: 'ID',
        taskConditionTemplate: "ID = '${taskId}'",
        fileTable: false,
        fileColumn: null,
        filePathTemplate: null,
        dependencyOrder: 0,
      },
      {
        tableName: 'DS_TASK_DETAIL',
        keyColumn: 'ID',
        taskConditionTemplate: "TASK_ID = '${taskId}'",
        fileTable: false,
        fileColumn: null,
        filePathTemplate: null,
        dependencyOrder: 10,
      },
    ],
    backupTables: [],
  },
}

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
    return simulate([...mockProfiles])
  }
  const { data } = await http.get('/config/table-profiles')
  return data
}

export async function fetchTableProfile(name) {
  if (useMock) {
    return simulate({
      ...(mockTableProfiles[name] || mockTableProfiles['zy_all_new.json']),
      _fileName: name,
    })
  }
  const { data } = await http.get(`/config/table-profiles/${encodeURIComponent(name)}`)
  return data
}

export async function saveTableProfile(name, profile) {
  if (useMock) {
    mockTableProfiles[name] = JSON.parse(JSON.stringify(profile))
    if (!mockProfiles.some((item) => item.name === name)) {
      mockProfiles = [...mockProfiles, { name, path: `config/table-profiles/${name}` }]
    }
    return simulate({ success: true, name })
  }
  const { data } = await http.put(`/config/table-profiles/${encodeURIComponent(name)}`, profile)
  return data
}

export async function deleteTableProfile(name) {
  if (useMock) {
    mockProfiles = mockProfiles.filter((item) => item.name !== name)
    delete mockTableProfiles[name]
    return simulate({ success: true, name })
  }
  const { data } = await http.delete(`/config/table-profiles/${encodeURIComponent(name)}`)
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

export async function deleteExportPlan(name) {
  if (useMock) {
    return simulate({ success: true, name })
  }
  const { data } = await http.delete(`/config/export-plans/${encodeURIComponent(name)}`)
  return data
}
