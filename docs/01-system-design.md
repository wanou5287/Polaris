# 系统设计

## 1. 目标

构建一个内部 Web 系统，售后人员输入设备 SN 后，系统返回：

- 当前有效销售周期
- 当前周期首次激活时间
- 标准保修与延保结果
- 最终保修结论
- 判定依据与警告信息

系统首期必须在 `mock` 模式完整跑通，同时预留 `real` 模式对接真实激活接口的能力。

## 2. 首期建议技术方案

为兼顾本地快速运行、后续扩展和清晰分层，首期建议采用：

- 前端：React + Vite + TypeScript
- 后端：Node.js + Fastify + TypeScript
- ORM：Prisma
- 数据库：SQLite
- UI：Ant Design
- 导入：`xlsx` 解析 Excel / CSV
- 校验：Zod

选择理由：

- 本地启动成本低，适合内部原型快速迭代
- TypeScript 贯通前后端，契约清晰
- Fastify 易于封装服务层与接口层
- SQLite 足够覆盖首期内部查询与台账导入场景
- Prisma 便于后续切换到 MySQL

## 3. 推荐目录结构

```text
E:\售后查询系统
├─ README.md
├─ docs
│  ├─ 01-system-design.md
│  ├─ 02-data-and-api-design.md
│  └─ 03-implementation-plan.md
├─ apps
│  ├─ web
│  │  ├─ src
│  │  │  ├─ pages
│  │  │  ├─ components
│  │  │  ├─ services
│  │  │  └─ types
│  └─ api
│     ├─ src
│     │  ├─ routes
│     │  ├─ controllers
│     │  ├─ services
│     │  ├─ repositories
│     │  ├─ integrations
│     │  ├─ domain
│     │  ├─ schemas
│     │  └─ utils
├─ packages
│  ├─ shared
│  │  ├─ src
│  │  │  ├─ constants
│  │  │  ├─ enums
│  │  │  ├─ contracts
│  │  │  └─ types
├─ prisma
│  ├─ schema.prisma
│  ├─ migrations
│  └─ seed
├─ mock
│  ├─ activation-data.json
│  └─ entitlement-import-samples
├─ scripts
└─ .env.example
```

## 4. 系统分层

### 4.1 页面层

职责：

- 输入 SN
- 展示查询结果
- 展示依据、警告、异常
- 展示销售周期与事件详情
- 导入延保权益

限制：

- 不直接读取 mock 文件
- 不参与保修规则计算

### 4.2 API 层

职责：

- 接收前端请求
- 参数校验
- 调用服务层
- 返回统一响应结构

### 4.3 业务服务层

建议拆分以下服务：

- `WarrantyDecisionService`
- `SaleCycleResolverService`
- `WarrantyEntitlementService`
- `ActivationRecordResolverService`
- `ImportEntitlementService`

### 4.4 激活查询服务层

统一抽象：

- `ActivationQueryService`

实现类：

- `MockActivationQueryService`
- `RealActivationQueryService`

要求：

- 业务服务层只依赖接口，不依赖具体实现
- 通过配置注入当前模式
- real 模式未完成时可返回占位异常，但不影响 mock 模式运行

### 4.5 数据访问层

仓储建议：

- `DeviceRepository`
- `SaleCycleRepository`
- `WarrantyEntitlementRepository`
- `DeviceEventRepository`

## 5. 核心业务流程

### 5.1 保修查询主流程

1. 前端传入 `sn`
2. API 校验 SN 格式
3. `WarrantyDecisionService` 读取设备、销售周期、权益台账
4. `SaleCycleResolverService` 判定当前有效销售周期
5. `ActivationQueryService` 查询该 SN 激活信息
6. `ActivationRecordResolverService` 结合当前周期、解绑时间、记录顺序判定当前周期首次激活时间
7. `WarrantyEntitlementService` 汇总标准保修和延保权益
8. `WarrantyDecisionService` 生成最终结论、依据、警告
9. API 返回统一结构给页面

### 5.2 导入延保权益流程

1. 上传 CSV / Excel
2. 服务端解析行数据
3. 校验 SN、销售周期、权益类型、天数、状态
4. 写入 `warranty_entitlements`
5. 记录 `ENTITLEMENT_IMPORTED` 事件
6. 返回导入成功 / 失败明细

## 6. 核心领域对象

建议统一定义以下领域模型：

- `Device`
- `SaleCycle`
- `ActivationRecord`
- `ActivationQueryResult`
- `WarrantyEntitlement`
- `WarrantyDecision`
- `DecisionBasisItem`
- `WarningItem`

## 7. 模式切换设计

通过环境变量控制：

```env
ACTIVATION_MODE=mock
ACTIVATION_MOCK_FILE=./mock/activation-data.json
ACTIVATION_REAL_BASE_URL=
ACTIVATION_REAL_TIMEOUT_MS=5000
ACTIVATION_REAL_AUTH_TYPE=
ACTIVATION_REAL_TOKEN=
```

服务注册示意：

- 当 `ACTIVATION_MODE=mock` 时，注入 `MockActivationQueryService`
- 当 `ACTIVATION_MODE=real` 时，注入 `RealActivationQueryService`

业务代码中禁止出现：

- `if (mock) 直接读 JSON`
- 页面层直连 mock 文件
- 在保修计算逻辑里写死真实接口 URL

## 8. 页面设计

### 8.1 查询页

模块：

- SN 输入框
- 查询按钮
- 最近查询记录
- 结果卡片区

### 8.2 结果区

展示内容：

- 结论状态
- 保修开始 / 结束时间
- 当前销售周期
- 标准保修天数
- 延保天数
- 判定依据
- 警告信息

### 8.3 详情页

展示内容：

- 设备主信息
- 当前及历史销售周期
- 激活记录
- 权益记录
- 事件日志

### 8.4 管理页

展示内容：

- 上传权益台账
- 导入结果明细
- 最近导入记录

## 9. 风险点

- “当前有效销售周期”判定错误会直接导致保修时间错误
- 激活记录可能无法唯一归属到某个周期
- real 模式字段未定，必须严格通过适配层隔离
- 导入台账质量参差，需要保留 `PENDING` 与人工核验能力

## 10. 首期落地边界

首期建议先完成：

- SQLite 数据模型
- mock 激活查询
- 保修判定服务
- 查询接口
- 查询页 / 详情页 / 导入页

暂不优先：

- 用户权限体系
- 平台渠道实时同步
- 复杂审批流
- 面向消费者的外部页面
