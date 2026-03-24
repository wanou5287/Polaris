# P0-05 库存状态流转与调拨触发

## 1. 背景

采购到货已经成为北极星的第一个动作型入口，但如果到货后的库存状态流转和仓间调拨仍然靠人工跟进，平台就只能停留在“记录事件”，还不能真正承接执行。

因此这一轮需要把两件事先拉起来：

- 库存流转规则
- 被业务动作触发出来的库存任务

## 2. 本轮目标

本轮目标是交付一版“可定义规则、可看到触发、可人工补单”的库存流转工作台。

交付范围：

- 建立库存流转规则表
- 建立库存流转任务表
- 提供规则查询 / 保存 API
- 提供任务查询 / 保存 API
- 采购到货保存后自动派生库存流转任务
- 新前端库存流转工作台
- 写入统一审计日志

## 3. 动作模型

本轮先收敛成两类动作：

- `status_transition`
  说明：库存状态变更，例如“待检 -> 采购良品”
- `warehouse_transfer`
  说明：仓间调拨，例如“到货仓 -> 不良品仓”

## 4. 规则模型

对象：`bi_inventory_flow_rule`

关键字段：

- `rule_name`
- `trigger_source`
- `trigger_condition`
- `action_type`
- `source_status_id / target_status_id`
- `source_warehouse_code / target_warehouse_code`
- `priority`
- `auto_create_task`
- `is_enabled`
- `note`

当前默认种子规则：

- 采购到货合格转采购良品
- 采购到货异常转采购不良品
- 销退不良转翻新生产

## 5. 任务模型

对象：`bi_inventory_flow_task`

关键字段：

- `task_no`
- `source_record_type / source_record_id / source_record_no`
- `trigger_source`
- `action_type`
- `task_status`
- `priority`
- `sku_code / sku_name`
- `request_qty / confirmed_qty`
- `source_status_id / target_status_id`
- `source_warehouse_code / target_warehouse_code`
- `planned_execute_date`
- `reason_text`
- `note`

## 6. 自动触发逻辑

本轮最关键的能力，是采购到货和库存流转之间真正串起来。

当前实现：

- 当采购到货保存为 `ready / completed / exception` 时
- 系统会读取启用中的自动规则
- 按合格数量或异常数量自动生成 / 更新库存流转任务
- 如果原来已经触发过但现在数量归零，对应任务会自动取消

## 7. 页面结构

页面名称：`库存流转与调拨触发`

页面结构：

- 顶部摘要区：待执行、阻塞、已完成、启用规则、自动规则
- 中部筛选区：任务状态、动作类型、关键词
- 左侧任务清单：展示自动触发和人工任务
- 右侧任务编辑：补录数量、状态、来源和备注
- 底部规则区：维护自动触发规则

## 8. API

### `GET /financial/bi-dashboard/api/inventory-flows`

返回：

- 规则列表
- 任务列表
- 摘要统计
- 动作类型、任务状态、优先级、状态、仓库选项

### `PUT /financial/bi-dashboard/api/inventory-flows/rules`

用途：

- 批量保存库存流转规则

### `POST /financial/bi-dashboard/api/inventory-flows/tasks`

用途：

- 新建人工任务
- 修改自动任务
- 推进任务状态

## 9. 验收标准

- 可以看到采购到货自动派生出的库存流转任务
- 可以手工新建一条状态流转或调拨任务
- 可以维护规则并决定是否自动触发
- 每次规则或任务保存都会留下审计记录
- 页面可以通过新前端导航进入

## 10. 下一步衔接

`P0-05` 完成后，最自然的下一步是 `P0-06 任务中心与异常待办`。

因为现在平台已经有了：

- 采购到货记录
- 库存流转任务
- 阻塞状态

下一步只要再加统一任务中心，就能把“待执行 / 阻塞 / 异常补偿”正式收口成闭环。
