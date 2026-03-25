# P1-03 补货建议与计划协同

## 1. 目标

把库存预警、未来 14 天预测和补货动作放进同一个工作台，形成“建议 -> 评审 -> 执行 -> 闭环”的协同入口。

这一版先解决三件事：
- 把低库存和高预测需求转成可编辑的补货建议
- 让运营可以维护供应方式、责任人、预计就绪日期和备注
- 把补货计划同步进任务中心，并保留审计记录

## 2. 本轮落地范围

### 后端
- 新增补货计划对象表：`bi_replenishment_plan_item`
- 新增补货工作台查询接口：`GET /financial/bi-dashboard/api/replenishment-workbench`
- 新增补货计划保存接口：`POST /financial/bi-dashboard/api/replenishment-workbench/plans`
- 新增补货计划到任务中心的自动同步：`source_module = replenishment`
- 新增补货计划保存审计：`module_key = replenishment`
- 增加显式表字段迁移，兼容旧版库表缺少 `sort_order` 的情况

### 前端
- 新增页面：`/operations/replenishment-planning`
- 页面包含：
  - 顶部经营摘要卡片
  - 建议筛选条
  - 左侧建议队列
  - 右侧计划编辑区
  - 底部库存预警与预测热点洞察
- 左侧导航和总览快捷入口已接入“补货协同”

## 3. 数据来源

补货建议优先来自：
1. `bi_inventory_alert_log` 的最新库存预警快照
2. 如果暂无预警快照，则回退到 `bi_sales_forecast_ai_daily` 的未来 14 天预测汇总

计划编辑时会维护这些核心字段：
- `material_name`
- `demand_type`
- `supply_mode`
- `plan_status`
- `priority`
- `current_stock_qty`
- `forecast_14d_qty`
- `threshold_days`
- `target_stock_qty`
- `suggested_qty`
- `expected_ready_date`
- `owner_name`
- `supplier_name`

## 4. 协同规则

- `draft` / `reviewing` 会进入任务中心作为待评审项
- `confirmed` / `executing` 会进入任务中心作为执行项
- `blocked` 会进入任务中心作为阻塞项
- `closed` 会在任务中心呈现为已完成

## 5. 验证结果

已完成的本地验证：
- `python -m py_compile main.py app/routes/bi_dashboard.py`
- 前端 `npm run lint`
- 前端 `npm run build`
- `GET /financial/bi-dashboard/api/replenishment-workbench` 返回 `200`
- `POST /financial/bi-dashboard/api/replenishment-workbench/plans` 返回 `200`
- `GET /financial/bi-dashboard/api/task-center?source_module=replenishment` 返回 `200`

## 6. 下一步建议

下一步建议继续往这三个方向收紧：
- 补货建议和采购到货单建立正式关联键
- 引入供应商主数据和采购周期配置
- 把补货执行结果回写到任务中心与对账补偿中心
