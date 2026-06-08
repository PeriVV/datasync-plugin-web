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
    folderCount: 2,
    folders: ['sql', 'files'],
    fileCount: 8,
    packageSize: 245760,
    packageContents: [
      { type: 'SQL 脚本', path: 'sql/', fileCount: 4, description: '包含汇总 SQL 和分表 SQL' },
      { type: '附件文件', path: 'files/', fileCount: 2, description: '按数据库模板配置导出' },
      { type: 'JSON 清单', path: 'manifest.json', fileCount: 1, description: '记录导出范围和表信息' },
      { type: '导出日志', path: 'export.log', fileCount: 1, description: '记录导出执行过程' },
    ],
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
  const rows = tables.map((item, index) => {
    const table = item.tableName || item.table || String(item)
    const columns = item.columns?.length ? item.columns : ['id', 'task_id', 'name']
    const insertKey = `${index + 100}`
    const updateKey = `${index + 200}`
    const hasDiff = index !== 0
    return {
      table,
      sourceTable: table,
      targetTable: item.targetTableName || table,
      columns,
      keyColumns: item.keyColumns || ['id'],
      sourceCount: index + 1,
      targetCount: index === 0 ? index + 1 : index,
      consistent: !hasDiff,
      sourceOnlyKeys: hasDiff ? [insertKey] : [],
      targetOnlyKeys: [],
      changedKeys: hasDiff ? [updateKey] : [],
      insertRecords: hasDiff ? 1 : 0,
      updateRecords: hasDiff ? 1 : 0,
      deleteRecords: 0,
      details: {
        inserts: hasDiff ? [{ key: insertKey, values: { id: insertKey, task_id: 'T-100', name: '源库新增记录' } }] : [],
        updates: hasDiff ? [{
          key: updateKey,
          fields: columns.map((field) => ({
            field,
            sourceValue: field === 'name' ? '源库名称' : `${field}-${updateKey}`,
            targetValue: field === 'name' ? '目标库名称' : `${field}-${updateKey}`,
            changed: field === 'name',
          })),
        }] : [],
        deletes: [],
        insertTruncated: false,
        updateTruncated: false,
        deleteTruncated: false,
        limit: 200,
      },
    }
  })
  return {
    success: true,
    comparedAt: new Date().toISOString(),
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
  const tables = Array.isArray(payload.tables) ? payload.tables : []
  const tableCount = tables.length
  const rowsInserted = payload.syncInserts ? Math.max(tableCount, 1) : 0
  const rowsUpdated = payload.syncUpdates ? tableCount : 0
  const rowsDeleted = payload.deleteTargetOnly ? tableCount : 0
  const operationDetails = tables.flatMap((item, index) => {
    const table = item.tableName || item.table || String(item)
    const details = []
    const insertKey = `P${String(index + 2).padStart(3, '0')}`
    const updateKey = `P${String(index + 1).padStart(3, '0')}`
    const deleteKey = `P${String(index + 4).padStart(3, '0')}`
    details.push({ table, key: insertKey, type: 'INSERT', status: payload.syncInserts ? 'SUCCESS' : 'SKIPPED', message: payload.syncInserts ? `${insertKey} 插入成功` : `${insertKey} 跳过插入，未开启新增同步`, changes: [] })
    details.push({ table, key: updateKey, type: 'UPDATE', status: payload.syncUpdates ? 'SUCCESS' : 'SKIPPED', message: payload.syncUpdates ? `${updateKey} 更新成功` : `${updateKey} 跳过更新，未开启更新同步`, changes: [{ field: 'param_value', targetValue: 1000, sourceValue: 1200 }] })
    details.push({ table, key: deleteKey, type: 'DELETE', status: payload.deleteTargetOnly ? 'SUCCESS' : 'SKIPPED', message: payload.deleteTargetOnly ? `${deleteKey} 删除成功` : `${deleteKey} 跳过删除，未开启删除同步`, changes: [] })
    return details
  })
  return {
    success: true,
    synced: true,
    syncPolicy: payload.syncPolicy,
    rowsInserted,
    rowsUpdated,
    rowsWritten: rowsInserted + rowsUpdated,
    rowsDeleted,
    tables: tables.map((item) => item.tableName || item.table || String(item)),
    operationDetails,
    failedTables: [],
    phases: [
      { phase: '清理目标数据', status: rowsDeleted ? '已完成' : '已跳过', detail: `已删除 ${rowsDeleted} 行` },
      { phase: '写入同步数据', status: '已完成', detail: `已写入 ${rowsInserted + rowsUpdated} 行` },
    ],
  }
}

export function mockBackupResult(payload) {
  return {
    success: true,
    backupTag: 'BK_20260604_001',
    taskId: payload.taskId,
    rowsCopied: 14,
    filesCopied: payload.includeAttachments ? 3 : 0,
    backupDirectory: payload.includeAttachments ? 'D:\\tmp\\zy\\.datasync-backups\\BK_20260604_001' : null,
    writtenTables: ['DS_TASK_BAK', 'DS_TASK_DETAIL_BAK', ...(payload.includeAttachments ? ['DS_TASK_FILE_BAK'] : [])],
    finishedAt: now(),
  }
}
