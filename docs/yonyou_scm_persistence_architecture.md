# 用友 SCM 单据持久化架构

## 目标

采购供应单据中心不再在页面加载时直接查询用友接口。
页面默认读取 MySQL 本地缓存数据，本地缓存再由后台任务自动同步用友最新单据。

## 当前覆盖范围

当前已接入以下 6 类用友 SCM 单据：

- 采购订单 `purchase_order`
- 采购入库 `purchase_inbound`
- 形态转换 `morphology_conversion`
- 调拨订单 `transfer_order`
- 调出单 `storeout`
- 调入单 `storein`

## 表结构设计

每类单据维护两张业务表：

- 原始表：保存从用友接口获取到的原始行级 JSON
- 清洗表：保存前端展示所需的清洗字段，以及完整清洗 JSON

对应表如下：

- `bi_yonyou_purchase_order_raw`
- `bi_yonyou_purchase_order_clean`
- `bi_yonyou_purchase_inbound_raw`
- `bi_yonyou_purchase_inbound_clean`
- `bi_yonyou_morphology_conversion_raw`
- `bi_yonyou_morphology_conversion_clean`
- `bi_yonyou_transfer_order_raw`
- `bi_yonyou_transfer_order_clean`
- `bi_yonyou_storeout_raw`
- `bi_yonyou_storeout_clean`
- `bi_yonyou_storein_raw`
- `bi_yonyou_storein_clean`

同时维护两张控制表：

- `bi_yonyou_scm_sync_state`
  记录每个模块最近同步时间、结果、行数、消息和触发方式
- `bi_yonyou_scm_sync_cursor`
  记录每个模块的最新游标时间、最新单据 ID、最近增量同步、最近历史回灌以及是否完成全量回灌

## 数据流

1. 后台任务调用用友单据列表接口
2. 原始响应按模块写入对应 `*_raw` 表
3. 原始行按页面口径聚合、去重、映射状态
4. 清洗结果写入对应 `*_clean` 表
5. 页面只读取 `*_clean` 表，不直接访问用友接口

## 历史全量回灌

历史回灌用于把用友历史单据尽可能完整沉淀到本地数据库。

- 模式：`backfill`
- 默认分页：`100`
- 默认最大页数：`500`
- 当某模块还没有完成全量回灌时，系统会继续沿用回灌模式
- 某模块在单次回灌中跑到空页或最后一页后，会把 `has_full_backfill` 标记为 `1`

## 增量游标

增量同步建立在 `bi_yonyou_scm_sync_cursor` 上。

- 游标优先使用清洗后的 `updated_at_display`
- 如果没有时间字段，则回退使用 `source_pubts`
- 如果时间仍不可用，则回退使用 `document_id`

增量同步规则：

- 模式：`incremental`
- 默认分页：`100`
- 默认最大页数：`5`
- 每次从第一页开始向后拉
- 当某一页全部数据都不比当前游标新时，判定为“已追到游标”，本轮停止

## 同步策略

- 已接入现有 `APScheduler`
- 自动轮询频率：每 `5` 分钟
- 页面加载时如果缓存为空或过期，会自动补做一次同步
- 缓存过期阈值：`300` 秒
- 手动同步接口：`POST /financial/bi-dashboard/api/procurement-supply/sync`

手动同步接口支持这些参数：

- `mode`: `incremental` 或 `backfill`
- `limit`: 增量模式的目标行数
- `page_size`: 单页大小
- `max_pages`: 本次最多抓取页数

## 页面行为

- 已配置用友时，采购供应页优先展示本地缓存
- 页面返回 `sync_summary`，用于展示：
  - 最近同步时间
  - 缓存是否过期
  - 总缓存量
  - 各模块缓存量
  - 各模块回灌进度
  - 各模块增量游标

## 当前约束

- 历史回灌受 `max_pages` 控制，超出后会保留“未完成回灌”状态，等待后续继续补拉
- 增量同步默认追最新窗口，适合运营控制台和执行看板
- 如果后续要做“按时间段回灌”或“全历史初始化脚本”，可以继续在当前游标体系上扩展
