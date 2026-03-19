# 用友库存与销售 ETL 脚本

脚本路径：`scripts/yonyou_inventory_sync.py`

功能：

- 按用友开放平台 `selfAppAuth/getAccessToken` 流程获取 `access_token`
- 调用“现存量查询”接口抓取当次库存快照
- 调用“销售出库列表查询”接口抓取销售出库明细
- 将销售出库接口返回的原始明细直接写入 MySQL
- 保留完整 `raw_json`，后续再通过新表做口径加工
- 支持一次性执行，也支持内置 `cron` 常驻调度

## 生成的表

1. `bi_inventory_snapshot_daily`

- 每次执行库存同步时保存一份日快照
- `snapshot_date` 表示业务归档日期
- `captured_at` 表示实际抓取时间

2. `bi_material_sales_daily`

- 按销售出库接口返回的原始行落库
- 保留 `qty` 原始正负值，不在落库时拆分退货
- 保留完整 `raw_json` 原始载荷，便于后续加工表重算口径

3. `bi_inventory_warehouse_map`

- 维护原始仓库到看板展示仓库的映射
- 只会自动补齐缺失的默认映射，不会覆盖人工维护结果

4. `bi_inventory_status_map`

- 维护 `stock_status_id` 到库存状态中文名称的映射
- 只会自动补齐缺失的默认映射，不会覆盖人工维护结果

5. `bi_inventory_snapshot_daily_cleaning`

- 基于 `bi_inventory_snapshot_daily` 原始表按日期、仓库、物料、物料状态聚合
- 仅保留启用仓库映射、启用状态映射且 `current_qty > 0` 的记录
- 同步库存原始数据后会自动刷新对应日期的清洗结果

## 配置

复制并修改示例文件：

```bash
copy config\yonyou_inventory_sync.example.yaml config\yonyou_inventory_sync.yaml
```

重点字段：

- `yonyou.base_url`: 用友环境地址，例如 `https://c3.yonyoucloud.com`
- `yonyou.app_key` / `yonyou.app_secret`: 开放平台应用凭证
- `yonyou.inventory.filters`: 现存量查询条件，通常填组织/仓库等内部 id
- `yonyou.salesout.filters`: 销售出库查询条件
- `database.url`: MySQL 连接串
- `job.cron`: 留空表示手工执行；填写 crontab 表达式表示常驻调度

## 手工执行

执行全部同步：

```bash
python scripts/yonyou_inventory_sync.py --config config/yonyou_inventory_sync.yaml
```

只同步库存：

```bash
python scripts/yonyou_inventory_sync.py --config config/yonyou_inventory_sync.yaml --mode inventory --snapshot-date 2026-03-09
```

回补某几天销售：

```bash
python scripts/yonyou_inventory_sync.py --config config/yonyou_inventory_sync.yaml --mode sales --sales-start-date 2026-03-01 --sales-end-date 2026-03-07
```

只做联调，不落库：

```bash
python scripts/yonyou_inventory_sync.py --config config/yonyou_inventory_sync.yaml --dry-run
```

## 常驻调度

命令行直接传 `cron`：

```bash
python scripts/yonyou_inventory_sync.py --config config/yonyou_inventory_sync.yaml --cron "0 2 * * *"
```

也可以把 `job.cron` 写进 YAML，然后直接启动脚本。

默认规则：

- `sales_days_behind: 1` 表示今天执行时抓取昨天销售数据
- `sales_window_days: 1` 表示每次只抓一天
- `snapshot_days_behind: 0` 表示库存快照按执行当天归档

## 注意事项

1. 用友库存接口返回的是“当前时点库存”，不是历史库存，所以日快照的准确性取决于你每天固定的执行时间。
2. `inventory.filters` 和 `salesout.filters` 里多数过滤字段要求传内部 id；如果你当前租户接口要求字段名或路径略有差异，直接在 YAML 中调整即可。
3. 销售表现在保存原始明细；如果要做“销售出库 / 退货 / 净出库”等指标，请基于 `bi_material_sales_daily` 另建加工表。
4. 如果租户接口要求 `access_token` 放在 body 而不是 query，把对应接口的 `access_token_mode` 改成 `body` 或 `both`。

## Web 定时配置

BI 看板现在已经支持直接在页面里配置原始数据定时任务：

- 页面入口：`/financial/bi-dashboard/sync-schedule`
- 功能包括：
  - 开关定时同步
  - 修改 `cron` 表达式
  - 切换同步模式（库存 + 销售 / 仅库存 / 仅销售）
  - 配置 `sales_days_behind`、`sales_window_days`、`snapshot_days_behind`
  - 查看最近执行状态、下次执行时间
  - 手动点击“立即执行一次”

说明：
- Web 页面只管理“调度参数”，不会覆盖 `config/yonyou_inventory_sync.yaml` 里的用友凭证、接口地址和数据库连接。
- 服务启动时会自动读取数据库里的最新调度配置并挂载定时任务。
