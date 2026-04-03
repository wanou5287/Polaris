# Polaris Windows 安装与集成规范

## 统一端口规范

- 用户可见入口只保留一个端口：`3000`
- 主系统后端固定：`8888`
- 售后维修模块 API 固定：`3210`
- 安装包内置 MySQL 固定：`13306`
- Data Agent 固定：
  - API：`18080`
  - UI：`18501`

## 路径规范

### 主系统

- `/login`
- `/workspace`
- `/operations/*`
- `/governance/*`

### 售后模块

- `/after-sales-entry`
- `/after-sales-app/`
- `/after-sales-api/*`

## 最重要的约束

- 售后模块不要再直接抢主系统端口
- 售后前端在集成模式下不单独对外暴露端口，只通过 `/after-sales-app/` 挂载
- 售后 API 只监听本机 `127.0.0.1:3210`
- 用户只通过 `3000` 访问系统
- 代理层必须兼容：
  - `/after-sales-api/auth/login`
  - `/after-sales-api/api/auth/login`
- 严禁再出现 `/api/api/...` 这种双前缀问题

## 开发模式和集成模式

### 独立开发

- 售后前端可以使用自己的 dev 端口
- 推荐：`5173`

### 集成到 Polaris

- 售后前端必须走以下入口：
  - `/after-sales-entry`
  - `/after-sales-app/`
  - `/after-sales-api/*`

## Windows 安装包要求

- 固定使用以下端口：
  - `3000`
  - `3210`
  - `8888`
  - `13306`
- 启动前先检查端口占用
- 如果是 Polaris 自己旧进程占用，先停旧进程
- 如果是外部未知进程占用，直接报错，不要强杀
