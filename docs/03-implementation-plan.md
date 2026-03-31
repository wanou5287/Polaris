# 实施计划

## 1. 建议迭代顺序

### 阶段 1：项目骨架

- 初始化前后端工程
- 建立共享类型与环境配置
- 接入 SQLite + Prisma
- 提供基础 README 和启动脚本

产出：

- 可运行空壳项目
- `.env.example`
- Prisma schema

### 阶段 2：基础数据模型

- 实现 `devices`
- 实现 `sale_cycles`
- 实现 `warranty_entitlements`
- 实现 `device_events`
- 提供 seed 数据

产出：

- 建表脚本
- 本地测试数据

### 阶段 3：激活查询抽象

- 定义 `ActivationQueryService`
- 实现 `MockActivationQueryService`
- 实现 `RealActivationQueryService` 占位类
- 加入配置切换

产出：

- `mock/activation-data.json`
- mode 切换配置

### 阶段 4：核心判定逻辑

- 实现 `SaleCycleResolverService`
- 实现 `ActivationRecordResolverService`
- 实现 `WarrantyEntitlementService`
- 实现 `WarrantyDecisionService`

产出：

- 可单测的业务服务

### 阶段 5：API

- `GET /api/warranty/query`
- `GET /api/sale-cycles/:saleCycleId`
- `POST /api/entitlements/import`

产出：

- 接口联调能力

### 阶段 6：前端页面

- 查询页
- 结果区
- 详情页
- 管理页

产出：

- 内部可用原型

### 阶段 7：测试与交付

- 核心服务单元测试
- 典型 SN 场景回归测试
- README 完善

产出：

- 可演示、可本地运行的首版系统

## 2. 首期开发优先级

P0：

- 查询主流程
- 当前有效销售周期判定
- 首次激活时间判定
- mock 模式完整跑通

P1：

- 详情页
- 权益导入
- 导入结果展示

P2：

- real 模式配置项完善
- 日志监控
- 更细粒度操作记录

## 3. 单元测试建议

至少覆盖：

- `SN001` 标准保修
- `SN002` 未激活
- `SN003` 退货重售
- `SN004` 激活记录冲突
- `SN005` 激活查询异常
- `SN006` 延保 180 天
- `SN007` 延保 365 天
- `SN008` 多个未关闭周期

## 4. 下一步建议

下一步最合适的是直接进入“项目骨架 + 数据模型 + mock 数据”实现，这样可以尽快把最关键的业务判断跑通。

如果继续由我往下做，建议按下面顺序推进：

1. 初始化项目目录和依赖
2. 写 Prisma schema 与种子数据
3. 写 mock 激活服务
4. 写保修判定服务
5. 暴露查询 API
6. 做查询页和结果页
