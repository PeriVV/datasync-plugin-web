import http from './http'
import {
  mockExportResult,
  mockImportResult,
  mockCompareResult,
  mockSyncResult,
  mockBackupResult,
} from '../mock/mockData'

const useMock = import.meta.env.VITE_USE_MOCK === 'true'

function simulate(response) {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve({ data: response }), 420)
  })
}

export async function exportData(payload) {
  if (useMock) {
    return simulate(mockExportResult(payload))
  }
  return http.post('/datasync/export', payload)
}

export async function previewExport(payload) {
  if (useMock) {
    const modelTables = ['DS_TASK', 'DS_TASK_DETAIL', 'DS_TASK_FILE']
    const tables = [...modelTables, ...(payload.manualScopes || []).map((item) => item.table)].map((table, index) => ({
      tableName: table,
      condition: index < modelTables.length ? "TASK_ID = 'TASK_001'" : '1 = 1',
      recordCount: index === 0 ? 1 : index === 1 ? 15 : index === 2 ? 3 : 20,
      attachmentTable: table === 'DS_TASK_FILE',
      attachmentCount: table === 'DS_TASK_FILE' && payload.includeFiles ? 3 : 0,
    }))
    return simulate({
      success: true,
      message: '导出内容预览完成',
      tableCount: tables.length,
      totalRecords: tables.reduce((sum, item) => sum + item.recordCount, 0),
      totalAttachments: tables.reduce((sum, item) => sum + item.attachmentCount, 0),
      tables,
    })
  }
  return http.post('/datasync/export-preview', payload)
}

export async function downloadExportFile(path) {
  if (useMock) {
    return new Blob(['mock export package'], { type: 'application/zip' })
  }
  const { data } = await http.get('/datasync/export/download', {
    params: { path },
    responseType: 'blob',
  })
  return data
}

export async function importData(payload) {
  if (useMock) {
    return simulate(mockImportResult(payload))
  }
  return http.post('/datasync/import', payload)
}

export async function compareData(payload) {
  if (useMock) {
    return simulate(mockCompareResult(payload))
  }
  return http.post('/datasync/compare', payload)
}

export async function syncData(payload) {
  if (useMock) {
    return simulate(mockSyncResult(payload))
  }
  return http.post('/datasync/sync', payload)
}

export async function backupData(payload) {
  if (useMock) {
    return simulate(mockBackupResult(payload))
  }
  return http.post('/datasync/backup', payload)
}

export async function previewBackup(payload) {
  if (useMock) {
    const targetTables = ['DS_TASK_BAK', 'DS_TASK_DETAIL_BAK', ...(payload.includeAttachments ? ['DS_TASK_FILE_BAK'] : [])]
    return simulate({
      success: true,
      message: '备份范围预览完成',
      tableCount: targetTables.length,
      recordCount: payload.includeAttachments ? 19 : 16,
      attachmentCount: payload.includeAttachments ? 3 : 0,
      logCount: payload.includeLogs ? 1 : 0,
      attachmentAvailable: true,
      logAvailable: true,
      targetTables,
      backupTagPreview: payload.backupMode === 'OVERWRITE_LAST' ? '执行时复用该业务对象最近一次备份号' : 'BK_20260604_001',
      tables: targetTables.map((targetTable, index) => ({
        sourceTable: targetTable.replace(/_BAK$/, ''),
        targetTable,
        recordCount: index === 0 ? 1 : index === 1 ? 15 : 3,
        contentType: targetTable.includes('FILE') ? 'ATTACHMENT' : 'RECORD',
        included: true,
      })),
    })
  }
  return http.post('/datasync/backup-preview', payload)
}

export async function inspectImportPackage(payload) {
  if (useMock) {
    return simulate({
      success: true,
      packageName: payload.inputPath || 'task_1896780229075202049.zip',
      tableCount: 3,
      recordCount: 19,
      attachmentCount: 3,
      tableNames: ['DS_TASK', 'DS_TASK_DETAIL', 'DS_TASK_FILE'],
    })
  }
  if (payload.file) {
    const formData = new FormData()
    formData.append('file', payload.file)
    if (payload.inputPath) formData.append('inputPath', payload.inputPath)
    return http.post('/datasync/import-package', formData)
  }
  return http.post('/datasync/import-package', payload)
}

export async function testProfileLocator(payload) {
  if (useMock) {
    const variables = Object.fromEntries((payload.conditions || []).map((item) => [item.field, item.values?.[0] || item.value || 'TEST']))
    return simulate({
      success: true,
      message: '定位成功',
      rowCount: 1,
      expectedMatched: true,
      variables,
      rows: [variables],
    })
  }
  return http.post('/datasync/profile-locator-test', payload)
}

export async function precheckImport(payload) {
  if (useMock) {
    return simulate({
      success: true,
      canImport: true,
      duplicateFiles: 1,
      checks: [
        { name: '表结构是否匹配', status: 'PASS', detail: '目标库包含导入包中的全部表' },
        { name: '主键是否冲突', status: 'WARNING', detail: '将在执行导入时按选择的冲突处理方式处理' },
        { name: '附件目录是否存在', status: 'PASS', detail: payload.targetFileRoot },
        { name: '是否有重复数据或文件', status: 'WARNING', detail: '发现 1 个相同指纹附件' },
      ],
    })
  }
  return http.post('/datasync/import-precheck', payload)
}

export async function previewTableProfile(payload) {
  if (useMock) {
    const conditionValues = Object.fromEntries((payload.conditions || []).map((item) => [item.field, item.values?.[0] || '']))
    const tables = (payload.profileDefinition?.autoTaskTables || []).map((item, index) => ({
      tableName: item.tableName,
      condition: Object.entries(conditionValues).reduce(
        (text, [key, value]) => text.replaceAll(`\${${key}}`, value),
        item.taskConditionTemplate?.replace(/\$\{(?:taskId|task_id)\}/g, payload.taskId || Object.values(conditionValues)[0] || '') || '1 = 1',
      ),
      recordCount: index + 1,
      attachmentTable: Boolean(item.fileTable),
      attachmentCount: item.fileTable ? 1 : 0,
    }))
    return simulate({
      success: true,
      message: '模型测试完成',
      taskId: payload.taskId,
      tableCount: tables.length,
      totalRecords: tables.reduce((sum, item) => sum + item.recordCount, 0),
      totalAttachments: tables.reduce((sum, item) => sum + item.attachmentCount, 0),
      tables,
    })
  }
  return http.post('/datasync/profile-preview', payload)
}
