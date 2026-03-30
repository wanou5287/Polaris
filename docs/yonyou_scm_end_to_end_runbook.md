# 用友供应链全链路联调手册

## 1. 目标

本文记录已经在当前项目中实现的标准联调链路：

`采购订单 -> 采购入库 -> 形态转换 -> 调拨订单 -> 调出单 -> 调入单`

重点说明三件事：

- 每个环节调用哪个用友开放接口
- 每个环节依赖哪一张上游单据
- 哪些租户规则需要在自动化时特别处理

## 2. 推荐执行顺序

推荐按下面顺序编排自动化流程：

1. 创建采购订单
2. 提交采购订单
3. 监听采购订单审批
4. 审批通过后创建采购入库
5. 提交采购入库
6. 监听采购入库审批
7. 审批通过后创建形态转换单
8. 如果存在序列号管理物料，先补齐序列号
9. 提交形态转换单
10. 监听形态转换审批
11. 审批通过后创建调拨订单
12. 审核调拨订单
13. 由调拨订单下推调出单
14. 提交调出单
15. 由调出单下推调入单
16. 提交调入单

## 3. 接口清单

| 环节 | 用途 | 接口 |
| --- | --- | --- |
| 采购订单 | 保存采购订单 | `POST /yonbip/scm/purchaseorder/singleSave_v1` |
| 采购订单 | 提交采购订单 | `POST /yonbip/scm/purchaseorder/batchsubmit` |
| 采购入库 | 采购订单来源生单保存 | `POST /yonbip/scm/purinrecord/mergeSourceData/save` |
| 采购入库 | 提交采购入库 | `POST /yonbip/scm/purinrecord/batchsubmit` |
| 形态转换 | 保存形态转换单 | `POST /yonbip/scm/morphologyconversion/save` |
| 形态转换 | 提交形态转换单 | `POST /yonbip/scm/morphologyconversion/batchsubmit` |
| 形态转换 | 撤回形态转换单 | `POST /yonbip/scm/morphologyconversion/batchunsubmit` |
| 调拨订单 | 保存调拨订单 | `POST /yonbip/scm/transferapply/save` |
| 调拨订单 | 审核调拨订单 | `POST /yonbip/scm/transferapply/batchaudit` |
| 调出单 | 调拨订单来源生单保存 | `POST /yonbip/scm/storeout/mergeSourceData/save` |
| 调出单 | 提交调出单 | `POST /yonbip/scm/storeout/batchsubmit` |
| 调入单 | 调出单来源生单保存 | `POST /yonbip/scm/storein/mergeSourceData/save` |
| 调入单 | 提交调入单 | `POST /yonbip/scm/storein/batchsubmit` |
| 物料查询 | 查询单位、税码、序列号属性 | `POST /yonbip/digitalModel/product/batchdetailnew` |
| 序列号查询 | 查询在库序列号 | `POST /yonbip/scm/snQuerysnstate/list` |

## 4. 上下游依赖

| 当前环节 | 上游依赖 | 说明 |
| --- | --- | --- |
| 采购订单 | 无 | 链路起点 |
| 采购入库 | 采购订单 | 使用采购订单来源生单保存 |
| 形态转换 | 采购入库 | 以入库后的成品库存为输入 |
| 调拨订单 | 采购入库或形态转换后的成品行 | 当前项目按审批通过后的有效库存生成 |
| 调出单 | 调拨订单 | 使用调拨订单来源生单保存 |
| 调入单 | 调出单 | 使用调出单来源生单保存 |

## 5. 当前租户规则

### 5.1 采购链路

- 当前租户采购订单后续应直接走采购入库来源生单，不走采购到货来源生单。
- `exchRateType` 必须使用租户真实有效值，不能直接照搬文档示例。
- 单位编码可以在物料接口授权后自动补齐。

### 5.2 形态转换

- `A70003` 这类形态转换需要把交易类型映射到正确的 `conversionType` 和 `mcType`。
- 成品行与子件行的 `lineType` 不同，必须分别设置。
- 如果 BOM 中存在序列号管理物料，提交前必须先把足量在库序列号回填到单据明细。

### 5.3 调拨链路

- 调拨订单在当前租户中可能不走工作流提交，而是直接走审核接口。
- 调出单提交后即可作为调入单来源，不需要等调出审批通过再创建调入。
- `bustype`、`makeRuleCode` 等内部值不建议手工硬编码，优先由系统从最近有效样本或固定规则自动推断。

## 6. 强制人工输入的业务字段

整条链路最少需要业务侧提供这些值：

```text
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

其余字段原则上由系统通过以下方式补齐：

- 物料主数据接口
- 来源单据带出
- 固定生单规则
- 最近有效单据推断

## 7. 脚本入口

本次联调主要使用以下脚本：

- `scripts/yonyou_purchase_order.py`
- `scripts/yonyou_purchase_order_flow.py`
- `scripts/yonyou_morphology_watch_live.py`

已覆盖的能力包括：

- 采购订单创建与校验
- 采购订单、采购入库、形态转换、调拨订单、调出单、调入单的创建、提交、审核与查询
- 审批监听与自动下推
- 序列号查询与回填
