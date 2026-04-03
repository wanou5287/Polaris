# 用友主数据持久化说明

## 当前范围

当前已基于 6 类 SCM 单据缓存，落地两类“从单据反向沉淀”的主数据：

- 供应商
- 人员

这两类数据不是直接调用用友主数据接口生成，而是从以下单据原始表中抽取并持续刷新：

- `bi_yonyou_purchase_order_raw`
- `bi_yonyou_purchase_inbound_raw`
- `bi_yonyou_morphology_conversion_raw`
- `bi_yonyou_transfer_order_raw`
- `bi_yonyou_storeout_raw`
- `bi_yonyou_storein_raw`

## 表结构分层

### 供应商

- `bi_yonyou_supplier_raw`
  供应商原始观察表。每条记录代表“某张单据里观察到一个供应商”。
- `bi_supplier_master`
  供应商当前主表。供后续前端、治理、映射和协同模块直接读取。
- `bi_supplier_master_history`
  供应商主表变更历史。记录 create、update、deactivate。

### 人员

- `bi_yonyou_employee_raw`
  人员原始观察表。每条记录代表“某张单据里观察到一个人员角色”。
- `bi_employee_master`
  人员当前主表。当前聚合 creator、operator、submitter、auditor 四类角色。
- `bi_employee_master_history`
  人员主表变更历史。记录 create、update、deactivate。

## 刷新逻辑

每次运行单据缓存同步时，会自动执行一轮主数据重建：

1. 先同步 6 类 SCM 单据原始表和清洗表
2. 再扫描全部单据原始表
3. 提取供应商和人员观察记录，重建 `*_raw`
4. 聚合生成 `*_master`
5. 对比旧快照，有变化时写入 `*_history`
6. 更新 `bi_yonyou_scm_sync_state`

此外，若系统发现：

- 单据原始表已经有数据
- 但供应商 / 人员主表还是空的

则会在读取缓存时自动执行一次 bootstrap 重建。

## 当前字段含义

### `bi_supplier_master`

核心字段：

- `supplier_key`
- `supplier_id`
- `supplier_code`
- `supplier_name`
- `source_modules_json`
- `observation_count`
- `last_seen_module`
- `last_seen_document_id`
- `last_seen_document_no`
- `last_seen_at`
- `profile_json`
- `is_active`

### `bi_employee_master`

核心字段：

- `employee_key`
- `employee_id`
- `employee_code`
- `employee_name`
- `role_tags_json`
- `source_modules_json`
- `observation_count`
- `last_seen_module`
- `last_seen_document_id`
- `last_seen_document_no`
- `last_seen_at`
- `profile_json`
- `is_active`

## 注意事项

- 当前“人员编码”更多是单据中能观察到的 `id/code/name` 混合结果，不等同于官方员工主数据中的标准工号。
- 供应商与人员目前属于“交易侧沉淀主数据”，适合用于本地查询、映射、审计和协同归属。
- 若后续接入用友正式主数据接口，建议保留当前表结构，并新增 authoritative source 标记或单独主数据源字段。

## 下一步建议

按同一模式继续扩展：

1. `物料信息`
   建议补 `bi_yonyou_material_raw` + 升级 `bi_sku_master`
2. `仓库信息`
   建议补 `bi_yonyou_warehouse_raw` + 升级 `bi_inventory_warehouse_map`
3. `供应商 / 人员` 前端查询入口
   让采购协同、用户管理、审计日志直接复用本地主数据
