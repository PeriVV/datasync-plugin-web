import { createRouter, createWebHistory } from 'vue-router'
import MainLayout from '../layouts/MainLayout.vue'
import DashboardView from '../views/DashboardView.vue'
import ExportView from '../views/ExportView.vue'
import ImportView from '../views/ImportView.vue'
import SyncView from '../views/SyncView.vue'
import BackupView from '../views/BackupView.vue'
import InfoView from '../views/InfoView.vue'
import EnvironmentView from '../views/EnvironmentView.vue'
import ProfileConfigView from '../views/ProfileConfigView.vue'

const routes = [
  {
    path: '/',
    component: MainLayout,
    redirect: '/dashboard',
    children: [
      { path: 'dashboard', name: 'dashboard', component: DashboardView, meta: { label: '总览' } },
      {
        path: 'overview',
        name: 'overview',
        component: InfoView,
        meta: {
          label: '同步概览',
          info: {
            title: '同步概览',
            description: '汇总离线包、在线同步、数据库模型和异常情况，帮助接入方判断当前数据同步链路是否健康。',
            hint: '这里展示的是接入控制台视角，不替代后端插件的执行日志。',
            cardTitle: '核心观察项',
            actionText: '执行比对同步',
            actionRoute: '/sync',
            items: [
              { title: '离线包状态', text: '关注导出包是否生成、导入是否成功、附件是否完整恢复。' },
              { title: '在线同步状态', text: '关注中心库与节点库在任务范围内是否一致。' },
              { title: '数据库模型状态', text: '关注当前数据库是否匹配正确的外置数据库模型。' },
              { title: '异常状态', text: '关注导入失败的数据脚本、附件缺失和同步写入异常。' },
            ],
          },
        },
      },
      { path: 'export', name: 'export', component: ExportView, meta: { label: '离线导出' } },
      { path: 'import', name: 'import', component: ImportView, meta: { label: '离线导入' } },
      { path: 'compare', redirect: '/sync' },
      { path: 'sync', name: 'sync', component: SyncView, meta: { label: '比对同步' } },
      { path: 'backup', name: 'backup', component: BackupView, meta: { label: '业务数据备份' } },
      {
        path: 'profiles',
        name: 'profiles',
        component: ProfileConfigView,
        meta: {
          label: '数据库模板配置',
        },
      },
      { path: 'config-generator', redirect: '/profiles' },
      {
        path: 'settings',
        name: 'settings',
        component: EnvironmentView,
        meta: {
          label: '数据源连接',
        },
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
