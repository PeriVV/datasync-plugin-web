import {
  IconBarChart,
  IconUpload,
  IconDownload,
  IconStorage,
  IconSafe,
  IconSettings,
} from '@arco-design/web-vue/es/icon'

export const navigationSections = [
  {
    key: 'basic-config',
    title: '基础配置',
    icon: IconStorage,
    expanded: true,
    items: [
      { key: 'settings', label: '数据源连接', icon: IconSettings, route: '/settings' },
      { key: 'profiles', label: '数据库模板配置', icon: IconStorage, route: '/profiles' },
    ],
  },
  {
    key: 'transfer',
    title: '数据导入与导出',
    icon: IconDownload,
    expanded: true,
    items: [
      { key: 'import', label: '数据导入', icon: IconDownload, route: '/import' },
      { key: 'export', label: '数据导出', icon: IconUpload, route: '/export' },
    ],
  },
  {
    key: 'sync-backup',
    title: '同步与备份',
    icon: IconSafe,
    expanded: true,
    items: [
      { key: 'sync', label: '比对同步', icon: IconBarChart, route: '/sync' },
      { key: 'backup', label: '业务数据备份', icon: IconSafe, route: '/backup' },
    ],
  },
]
