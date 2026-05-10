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
  return {
    success: true,
    mode: payload.mode,
    taskId: payload.taskId,
    summary: {
      totalTables: 4,
      consistentTables: 3,
      inconsistentTables: 1,
    },
    tables: [
      { table: 'zy_task', sourceRows: 1, targetRows: 1, consistent: true, sourceOnly: [], targetOnly: [], changed: [] },
      { table: 'set_calc_param', sourceRows: 2, targetRows: 2, consistent: false, sourceOnly: [], targetOnly: [], changed: ['1101'] },
      { table: 'zy_file_new', sourceRows: 1, targetRows: 1, consistent: true, sourceOnly: [], targetOnly: [], changed: [] },
      { table: 'zy_dict', sourceRows: 2, targetRows: 2, consistent: true, sourceOnly: [], targetOnly: [], changed: [] },
    ],
  }
}

export function mockSyncResult(payload) {
  return {
    success: true,
    synced: true,
    rowsWritten: payload.mode === 'full' ? 48 : 11,
    filesCopied: payload.copyFiles ? 3 : 0,
    taskId: payload.taskId,
    phases: [
      { phase: '清理目标数据', status: '已完成', detail: '按依赖倒序完成清理' },
      { phase: '写入同步数据', status: '已完成', detail: '按依赖正序完成回写' },
      { phase: '复制附件文件', status: payload.copyFiles ? '已完成' : '已跳过', detail: payload.copyFiles ? '附件复制完成' : '未启用附件复制' },
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
