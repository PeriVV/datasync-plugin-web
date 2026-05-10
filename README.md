# datasync-plugin-web

独立前端工程，位于 `E:\weiwei\datasync-plugin-web`，用于操作后端 `DataSyncPluginServerApplication` 提供的数据同步接口。

## 技术栈

- Vue 3
- Vite
- Arco Design Vue
- Vue Router
- Axios

## 页面范围

左侧侧边栏围绕数据同步插件重新组织：

- `接入总览`
- `导出数据`
- `导入数据`
- `差异比对`
- `在线同步`
- `任务备份`

## 运行

```bash
npm install
npm run dev
```

默认通过 Vite 代理访问后端 `/api`。后端默认地址为 `http://localhost:8080`，前端开发地址为 `http://localhost:5173/`。

如果后端地址不是默认值，可在启动前设置：

```bash
VITE_PROXY_TARGET=http://localhost:8080
```
