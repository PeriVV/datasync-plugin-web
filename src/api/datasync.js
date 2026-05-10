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
