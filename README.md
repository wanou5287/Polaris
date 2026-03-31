# 平板 TOC 售后保修查询系统

当前目录用于存放该系统的设计文档和实现代码，所有项目产物均保存在 `E:\售后查询系统`。

## 当前版本重点

本版已经按最新变更完成以下调整：

- 查询输入由单一 `SN` 改为 `SN + 订单号`
- 标准保修仍按 `SN + 激活时间` 计算
- 延保权益必须按 `SN + 订单号` 匹配成功后才叠加
- 若提供渠道，可继续按 `SN + 订单号 + 渠道` 收紧匹配
- 未匹配到延保时，默认只显示标准保修 365 天
- 若同一 `SN + 订单号` 存在多条有效延保记录，返回待人工审核

## 文档目录

- [系统设计](./docs/01-system-design.md)
- [数据与接口设计](./docs/02-data-and-api-design.md)
- [实施计划](./docs/03-implementation-plan.md)

## 当前工程结构

```text
E:\售后查询系统
├─ apps
│  ├─ api
│  └─ web
├─ docs
├─ mock
├─ packages
│  └─ shared
├─ prisma
└─ README.md
```

## 已实现能力

- `GET /api/warranty/query?sn={sn}&sourceOrderNo={orderNo}`
- `GET /api/sale-cycles/{saleCycleId}`
- `POST /api/entitlements/import`
- `ACTIVATION_MODE=mock | real` 配置切换
- SQLite 本地数据库
- mock 激活查询和 real 激活查询共用统一抽象

## 本地启动

1. 安装依赖

```bash
npm install
```

2. 初始化数据库

```bash
npx prisma generate
npx prisma db push
npm run db:seed
```

3. 启动前后端

```bash
npm run dev
```

4. 访问地址

- 前端：`http://localhost:5173`
- 后端：`http://localhost:3210`

## 查询逻辑

1. 用户输入 `SN + 订单号`
2. 系统根据 `SN` 查询激活时间
3. 若已激活，则先计算标准保修 `365` 天
4. 系统再根据 `SN + 订单号` 匹配权益台账
5. 若匹配成功，则叠加延保天数
6. 若未匹配，则只显示标准保修，并提示“未匹配到延保权益”
7. 若匹配冲突或关键字段异常，则返回待人工审核

## mock 测试样例

当前可直接在页面里测试以下场景：

- `SN001 + ORDER001`
  匹配成功，延保 180 天
- `SN001 + ORDER002`
  同一 SN 另一订单无延保，只显示标准保修
- `SN003 + ORDER021`
  历史周期已关闭，当前周期正常计算
- `SN009 + ORDER_CONFLICT`
  同一 `SN + 订单号` 存在两条有效延保记录，返回待人工审核

相关文件：

- mock 激活数据：`mock/activation-data.json`
- Excel 导入模板：`apps/web/public/entitlements-sample.csv`

## 设计原则

- 标准保修和延保匹配必须分开处理
- 激活查询必须统一经过 `ActivationQueryService`
- `mock` 与 `real` 模式通过配置切换，不改业务代码
- 页面层只负责输入与展示，不直接读取 mock 数据
- 延保权益不允许再按 SN 单独叠加，必须至少按 `SN + 订单号`
