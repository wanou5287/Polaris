# P1-01 翻新生产协同升级

## 1. 背景

P0 阶段已经完成了口径治理、主数据、审计、采购到货、库存流转、任务中心和对账补偿，平台具备了从录入到补偿的第一版闭环。

但翻新模块仍停留在“日报录入”阶段，还缺：

- 产能配置
- 排产日历
- 工序状态协同
- 负责人分配
- 风险与阻塞视图
- 与任务中心的联动

蓝图里“翻新节拍日历”和“每天排多少台、哪天物料会断”就是这一步要补的协同层。

## 2. 本轮目标

本轮先交付翻新协同工作台第一版，范围聚焦在四件事：

- 维护拆解 / 修复 / 组装三类日产能
- 维护翻新排产项
- 汇总计划、实际、待料和产能缺口
- 把排产项同步到任务中心

## 3. 数据模型

### 3.1 产能档

新增表：`bi_refurb_capacity_profile`

关键字段：

- `refurb_category`
- `stage_key / stage_name`
- `daily_capacity`
- `owner_name / owner_role`
- `effective_date`
- `is_enabled`
- `note`

唯一约束：

- `refurb_category + stage_key`

### 3.2 排产项

新增表：`bi_refurb_schedule_item`

关键字段：

- `schedule_no / schedule_date`
- `refurb_category / material_name`
- `stage_key`
- `planned_qty / actual_qty / backlog_qty / material_ready_qty`
- `status / risk_level`
- `owner_name / owner_role`
- `blocker_reason / note`

唯一约束：

- `schedule_date + refurb_category + material_name + stage_key`

## 4. 工作台结构

新页面：`/operations/refurb-production`

结构分四块：

- 顶部摘要：排产总数、高风险、产能缺口、待料缺口、计划台数、达成率
- 节拍视图：计划与实际的时间轴
- 产能档：按翻新类别和工序维护日产能
- 排产清单与编排：维护状态、负责人、风险、阻塞原因和备注
- 近期实际产出：引用既有翻新日报结果，用于校对排产与真实完成

## 5. 接口

### `GET /financial/bi-dashboard/api/refurb-collaboration`

返回：

- 协同摘要
- 产能档列表
- 排产项列表
- 节拍日历
- 近期实际产出
- 筛选项

### `POST /financial/bi-dashboard/api/refurb-collaboration/capacity`

用途：

- 新增或更新翻新产能档

### `POST /financial/bi-dashboard/api/refurb-collaboration/schedule-items`

用途：

- 新增或更新排产项
- 同步任务中心
- 写入审计日志

## 6. 任务中心联动

排产项会自动映射到 `bi_task_center_item`：

- `pending` -> `open`
- `in_progress` -> `in_progress`
- `blocked` -> `blocked`
- `completed` -> `completed`

映射后的来源模块是 `refurb`，这样任务中心可以统一看到采购、库存和翻新三条执行链。

## 7. 验收标准

- 可以维护翻新产能档
- 可以维护翻新排产项
- 可以查看计划 / 实际 / 缺口 / 风险摘要
- 排产项保存后能同步进任务中心
- 总览页可以出现“翻新协同”入口
- 前端页面、后端接口、构建和类型检查全部通过

## 8. 下一步衔接

`P1-01` 完成后，建议继续：

1. `P1-02 逆向售后与退货承接`
2. `P1-03 补货建议与计划协同`

这样就能把翻新链继续向前接到售后逆向，向后接到计划与补货。
