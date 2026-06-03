function now() {
  return new Date().toLocaleString('zh-CN', { hour12: false })
}

function splitTaskIds(value) {
  return String(value || '')
    .split(/[\n,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function mockExportResult(payload) {
  const taskIds = splitTaskIds(payload.taskIds)
  return {
    success: true,
    packageName: `datasync-export-${Date.now()}.zip`,
    outputPath: payload.outputPath || '未选择导出路径',
    profile: payload.profile || 'zy_all_new',
    manifest: {
      generatedAt: now(),
      taskIds,
      tables: [
        { table: 'zy_task', rows: taskIds.length || 1 },
        { table: 'set_calc_param', rows: Math.max(taskIds.length * 2, 2) },
        { table: 'zy_file_new', rows: Math.max(taskIds.length, 1) },
      ],
    },
  }
}

export function mockImportResult(payload) {
  return {
    success: true,
    inserted: 18,
    updated: 5,
    skipped: 0,
    failed: 0,
    inputPath: payload.inputPath,
    targetEnv: payload.targetEnv,
    finishedAt: now(),
  }
}

export function mockCompareResult(payload) {
  const tables = Array.isArray(payload.tables) && payload.tables.length
    ? payload.tables
    : [
        { tableName: 'zy_task', columns: ['id', 'task_id', 'name'] },
        { tableName: 'set_calc_param', columns: ['id', 'task_id', 'name'] },
      ]
  const rows = tables.map((item, index) => ({
    table: item.tableName || item.table || String(item),
    columns: item.columns || [],
    sourceCount: index + 1,
    targetCount: index === 0 ? index + 1 : index,
    consistent: index === 0,
    sourceOnlyKeys: index === 0 ? [] : [`${index + 100}`],
    targetOnlyKeys: [],
    changedKeys: index === 0 ? [] : [`${index + 200}`],
    insertRecords: index === 0 ? 0 : 1,
    updateRecords: index === 0 ? 0 : 1,
    deleteRecords: 0,
  }))
  return {
    success: true,
    summary: {
      totalTables: rows.length,
      consistentTables: rows.filter((item) => item.consistent).length,
      inconsistentTables: rows.filter((item) => !item.consistent).length,
      insertRecords: rows.reduce((sum, item) => sum + item.insertRecords, 0),
      updateRecords: rows.reduce((sum, item) => sum + item.updateRecords, 0),
      deleteRecords: 0,
    },
    tables: rows,
  }
}

export function mockSyncResult(payload) {
  const tableCount = Array.isArray(payload.tables) ? payload.tables.length : 0
  return {
    success: true,
    synced: true,
    rowsWritten: Math.max(tableCount * 2, 1),
    rowsDeleted: tableCount,
    tables: (payload.tables || []).map((item) => item.tableName || item.table || String(item)),
    phases: [
      { phase: '清理目标数据', status: '已完成', detail: `已删除 ${tableCount} 行` },
      { phase: '写入同步数据', status: '已完成', detail: `已写入 ${Math.max(tableCount * 2, 1)} 行` },
    ],
  }
}

export function mockBackupResult(payload) {
  return {
    success: true,
    backupTag: `backup_${Date.now()}`,
    taskId: payload.taskId,
    rowsCopied: 14,
    writtenTables: ['zy_task_backup', 'set_calc_param_backup', 'zy_file_new_backup'],
    finishedAt: now(),
  }
}
