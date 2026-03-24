# 北极星新前端

这是北极星 Web 界面的正式重构基线。

## 技术栈

- React 19
- Next.js 16
- TailwindCSS v4
- TypeScript
- shadcn/ui

## 目录说明

- `src/app/`：页面与代理路由
- `src/components/polaris/`：北极星业务组件与工作台壳层
- `src/components/ui/`：shadcn/ui 组件
- `src/lib/`：类型、API 工具、代理辅助

## 本地运行

默认依赖现有 FastAPI 服务作为能力层，地址为：

- `http://127.0.0.1:8888`

如需修改，可设置环境变量：

- `POLARIS_API_BASE_URL`

### 开发命令

```bash
npm run dev
```

### 校验命令

```bash
npm run lint
npm run build
```

## 约束

- 新的 Web 页面优先开发在这里
- 不再继续把旧模板页作为新的视觉和交互基线
- 所有 UI 改动遵循黑白灰主色、浅蓝 CTA、圆角、留白、轻阴影、自然过渡
