# 用友供应链字段模板与人工输入清单

## 1. 说明

本文只回答一个问题：

哪些字段必须由业务侧人工提供，哪些字段可以由系统自动补齐。

默认原则：

- 能从来源单据带出的字段，不重复要求人工填写
- 能从物料主数据查询到的字段，优先自动补齐
- 能从租户最新有效单据推断的内部业务类型，优先自动推断

## 2. 全局配置

| 字段 | 是否需要人工提供 | 说明 |
| --- | --- | --- |
| `app_key` | 是 | 用友开放平台应用凭证 |
| `app_secret` | 是 | 用友开放平台应用凭证 |
| `base_url` | 是 | 例如 `https://c3.yonyoucloud.com` |

## 3. 采购订单

### 3.1 必填人工字段

| 字段 | 说明 | 示例 |
| --- | --- | --- |
| `material_code` | 采购物料编码 | `MATERIAL_CODE` |
| `qty` | 采购数量 | `1` |
| `unit_price` | 采购单价 | `0` |
| `bustype_code` | 采购业务类型编码 | `PURCHASE_BUSTYPE_CODE` |
| `vendor_code` | 供应商编码 | `VENDOR_CODE` |
| `org_code` | 采购组织编码 | `ORG_CODE` |
| `exchRateType` | 汇率类型编码 | `EXCHANGE_RATE_TYPE` |
| `taxitems_code` | 税目编码 | `TAXITEMS_CODE` |

### 3.2 条件必填

| 字段 | 何时需要人工提供 | 说明 |
| --- | --- | --- |
| `invoice_vendor_code` | 开票供应商与供应商不一致时 | 不填默认等于 `vendor_code` |
| `in_org_code` | 入库组织与采购组织不一致时 | 不填默认等于 `org_code` |
| `in_invoice_org_code` | 收票组织与采购组织不一致时 | 不填默认等于 `org_code` |
| `creator` | 需要指定创建人时 | 可选 |
| `creatorId` | 需要指定创建人时 | 可选 |

### 3.3 可自动补齐

| 字段 | 自动补齐来源 |
| --- | --- |
| `unit_code` | 物料主数据 |
| `purUOM_Code` | 物料主数据 |
| `priceUOM_Code` | 物料主数据 |
| `currency_code` | 固定默认值 |
| `nat_currency_code` | 固定默认值 |
| `exch_rate` | 固定默认值 |
| `invoice_vendor_code` | 默认等于供应商 |
| `in_org_code` | 默认等于采购组织 |
| `in_invoice_org_code` | 默认等于采购组织 |

## 4. 采购入库

### 4.1 必填人工字段

| 字段 | 说明 | 示例 |
| --- | --- | --- |
| `purchase_order_code` 或 `purchase_order_id` | 来源采购订单 | `PURCHASE_ORDER_CODE` |
| `warehouse_code` | 入库仓库编码 | `INBOUND_WAREHOUSE_CODE` |

### 4.2 可自动补齐

| 字段 | 自动补齐来源 |
| --- | --- |
| `makeRuleCode` | 固定来源生单规则 |
| `bustype` | 最近有效采购入库单推断 |
| 明细数量、单位、税码 | 来源采购订单带出 |

## 5. 形态转换

### 5.1 必填人工字段

| 字段 | 说明 | 示例 |
| --- | --- | --- |
| `source_inbound_code` 或 `source_inbound_id` | 业务上对应的采购入库 | `PURCHASE_INBOUND_CODE` |
| `businesstype` | 形态转换业务类型 | `A70003` |
| `before_warehouse` | 转换前仓库 | `SOURCE_WAREHOUSE_CODE` |
| `after_warehouse` | 转换后仓库 | `TARGET_WAREHOUSE_CODE` |
| `bom_lines` | 成品和子件明细 | 见下方模板 |

### 5.2 BOM 模板

```json
[
  {
    "role": "finished",
    "productCode": "FINISHED_PRODUCT_CODE",
    "qty": 1
  },
  {
    "role": "component",
    "productCode": "COMPONENT_CODE_1",
    "qty": 1
  },
  {
    "role": "component",
    "productCode": "COMPONENT_CODE_2",
    "qty": 1
  }
]
```

### 5.3 条件必填

| 字段 | 何时需要人工提供 | 说明 |
| --- | --- | --- |
| `serial_numbers` | BOM 行物料为序列号管理时 | 必须先查询在库序列号再回填 |

### 5.4 可自动补齐

| 字段 | 自动补齐来源 |
| --- | --- |
| `conversionType` | 由业务类型映射 |
| `mcType` | 由业务类型映射 |
| `lineType` | 根据成品或子件角色映射 |
| `product` | 物料主数据 |
| `mainUnitId` | 物料主数据 |
| `stockUnitId` | 物料主数据 |
| `productsku` | 物料主数据 |
| `stockStatusDoc` | 租户默认库存状态 |
| `warehousePersonId` | 仓库默认仓管 |

## 6. 调拨订单

### 6.1 必填人工字段

| 字段 | 说明 | 示例 |
| --- | --- | --- |
| `source_inbound_code` 或 `source_inbound_id` | 当前实现按采购入库成品行生成调拨订单 | `PURCHASE_INBOUND_CODE` |
| `outwarehouse_code` | 调出仓编码 | `OUT_WAREHOUSE_CODE` |
| `inwarehouse_code` | 调入仓编码 | `IN_WAREHOUSE_CODE` |

### 6.2 可自动补齐

| 字段 | 自动补齐来源 |
| --- | --- |
| `bustype` | 最近有效调拨订单推断 |
| `qty` | 来源采购入库带出 |
| `product` | 来源采购入库带出 |
| `unit`、`stockUnitId`、`taxitems_code` | 来源采购入库带出 |

## 7. 调出单

### 7.1 必填人工字段

| 字段 | 说明 | 示例 |
| --- | --- | --- |
| `transfer_order_code` 或 `transfer_order_id` | 来源调拨订单 | `TRANSFER_ORDER_CODE` |

### 7.2 可自动补齐

| 字段 | 自动补齐来源 |
| --- | --- |
| `bustype` | 最近有效调出单推断 |
| `makeRuleCode` | 固定为 `st_transferapply` |
| `outwarehouse` | 来源调拨订单带出 |
| `inwarehouse` | 来源调拨订单带出 |
| `qty` | 来源调拨订单带出 |

## 8. 调入单

### 8.1 必填人工字段

| 字段 | 说明 | 示例 |
| --- | --- | --- |
| `storeout_code` 或 `storeout_id` | 来源调出单 | `STOREOUT_CODE` |

### 8.2 可自动补齐

| 字段 | 自动补齐来源 |
| --- | --- |
| `bustype` | 最近有效调入单推断 |
| `makeRuleCode` | 固定为 `storeoutTostorein` |
| `outwarehouse` | 来源调出单带出 |
| `inwarehouse` | 来源调出单带出 |
| `qty` | 来源调出单带出 |

## 9. 最小人工输入集合

如果目标是把整条链路从头跑到尾，人工最少只需要准备这些业务值：

```text
AppKey=
AppSecret=

采购订单：
material_code=
qty=
unit_price=
bustype_code=
vendor_code=
org_code=
exchRateType=
taxitems_code=

采购入库：
warehouse_code=

形态转换：
morphology_bustype=A70003
before_warehouse=
after_warehouse=
bom_lines=

调拨：
outwarehouse_code=
inwarehouse_code=
```

其余字段原则上均由系统结合以下来源自动补齐：

- 物料主数据
- 来源单据
- 最近有效单据
- 固定生单规则

## 10. 最容易卡住的字段

| 字段 | 原因 |
| --- | --- |
| `exchRateType` | 文档示例值未必是租户真实值 |
| `bustype` | 不同租户内部 ID 不同 |
| `warehouse_code` | 业务侧常给编码，但接口落库通常使用仓库 ID |
| `serial_numbers` | 序列号管理物料提交前必须补齐 |
| `makeRuleCode` | 来源生单规则写错会直接无法下推 |
