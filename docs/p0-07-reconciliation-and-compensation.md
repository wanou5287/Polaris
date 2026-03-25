# P0-07 数据对账与失败补偿

## 1. 背景

`P0-04` 到 `P0-06` 已经把采购到货、库存流转和任务中心串成了一条可执行链路，但团队仍然缺一个统一的“差异定位 + 失败补偿”工作台：

- 单据已经录入，但单据编排或回写失败
- 采购到货已经落库，但没有生成对应库存流转任务
- 库存流转任务已经创建，但处于阻塞或逾期状态

如果这些问题只能依靠人工备注和跨页面排查，平台的执行闭环就会断在最后一步。

## 2. 本轮目标

本轮交付一版“对账补偿中心”，让团队可以在一个页面里完成：

- 自动汇总采购到货和库存流转中的异常案例
- 按状态、类型、严重性快速筛选和定位
- 查看期望快照与实际快照的差异
- 直接执行失败补偿动作
- 把补偿动作同步回任务中心与审计日志

## 3. 后端设计

### 3.1 对账案例表

新增表：`bi_reconciliation_case`

关键字段：

- `source_module / source_type / source_id / source_no`
- `case_type / case_title / case_status / severity`
- `diff_summary`
- `owner_name / owner_role / due_date`
- `expected_snapshot_json / actual_snapshot_json`
- `last_compensation_action / compensation_note`
- `compensated_at / compensated_by`

唯一约束：

- `source_module + source_type + source_id + case_type`

这样可以保证同一来源对象的同一类对账案例不会被重复创建。

### 3.2 自动对账来源

来源一：`bi_procurement_arrival`

- 单据状态失败或未生成时，生成 `document_sync`
- 已到货但未生成库存任务时，生成 `inventory_task_missing`
- 已生成库存任务但执行滞后时，生成 `inventory_task_lag`

来源二：`bi_inventory_flow_task`

- 任务阻塞时，生成 `inventory_task_blocked`
- 任务逾期未完成时，生成 `inventory_task_overdue`

### 3.3 补偿动作

当前内置补偿动作：

- `retry_document_sync`
- `resync_inventory_tasks`
- `reopen_inventory_task`
- `mark_resolved`
- `ignore_case`

补偿动作执行后，会同步刷新：

- `bi_reconciliation_case`
- `bi_task_center_item`
- 原始业务表状态
- 审计日志

## 4. 前端工作台

新页面：`/operations/reconciliation-center`

页面结构：

- 顶部摘要卡：待处理、补偿中、高严重性、单据异常、任务缺失、逾期/阻塞
- 中部筛选区：关键词、案例状态、案例类型、严重性
- 左侧案例列表：统一查看待处理和补偿中的案例
- 右侧补偿面板：负责人、角色、到期日、补偿动作、备注
- 底部快照对比：期望状态 vs 实际状态

交互原则：

- 优先展示最需要处理的高严重性案例
- 选中案例后给出默认建议补偿动作
- 保存或补偿执行后自动刷新列表

## 5. API

### `GET /financial/bi-dashboard/api/reconciliation-center`

返回：

- 对账案例列表
- 摘要统计
- 状态、类型、严重性、来源模块、补偿动作选项

特点：

- 每次查询前都会先同步一次最新对账快照
- 这样采购到货和库存流转的新异常能够快速进入工作台

### `POST /financial/bi-dashboard/api/reconciliation-center/cases`

用途：

- 更新负责人、角色、到期日、备注
- 执行补偿动作
- 回写任务中心和原始业务表

## 6. 验收标准

- 能自动从采购到货和库存流转中生成对账案例
- 能筛选出高严重性、阻塞、逾期案例
- 能执行“重试单据编排、重建库存任务、重新打开任务”等补偿动作
- 补偿执行后，任务中心和审计日志能看到同步结果
- 总览页可以看到对账补偿摘要和最新案例

## 7. 下一步衔接

`P0-07` 完成后，P0 主链路已经形成：

- 口径治理
- 主数据治理
- 审计留痕
- 采购到货
- 库存流转
- 任务中心
- 对账补偿

建议下一步进入 `P1-01 翻新生产协同升级`，把执行闭环进一步延伸到产线和返修场景。
