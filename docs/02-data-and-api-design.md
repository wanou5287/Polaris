# 数据与接口设计

## 1. 核心枚举

### 1.1 设备状态 `current_device_status`

- `UNSOLD`
- `SOLD_WAIT_ACTIVATION`
- `IN_USE`
- `RETURN_PENDING`
- `UNBOUND`
- `RESALABLE`

### 1.2 销售周期状态 `sale_status`

- `CREATED`
- `ACTIVATED`
- `RETURN_PENDING`
- `UNBOUND`
- `CLOSED`

### 1.3 权益类型 `entitlement_type`

- `BASE`
- `EXTENDED`

### 1.4 权益来源 `source_channel`

- `TMALL`
- `DOUYIN`
- `OFFLINE`
- `MANUAL_IMPORT`
- `OTHER`

### 1.5 权益状态 `status`

- `ACTIVE`
- `PENDING`
- `INVALID`

### 1.6 结果状态 `decision_status`

- `IN_WARRANTY`
- `OUT_OF_WARRANTY`
- `NOT_STARTED`
- `PENDING_MANUAL_REVIEW`
- `UNSOLD_OR_UNDETERMINED`
- `QUERY_ERROR`
- `SN_NOT_FOUND`

## 2. 数据表设计

### 2.1 devices

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 主键 |
| sn | string | 唯一设备序列号 |
| model | string | 型号 |
| factory_date | datetime | 出厂时间 |
| current_device_status | string | 当前设备状态 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

约束：

- `sn` 唯一索引

### 2.2 sale_cycles

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 主键 |
| sale_cycle_id | string | 周期编号，唯一 |
| sn | string | 设备 SN |
| cycle_no | int | 第几次销售 |
| sale_status | string | 周期状态 |
| sold_at | datetime | 销售时间 |
| activated_at | datetime nullable | 本周期首次激活时间 |
| return_received_at | datetime nullable | 退货入仓时间 |
| unbound_at | datetime nullable | 解绑时间 |
| cycle_closed_at | datetime nullable | 周期关闭时间 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

约束：

- `sale_cycle_id` 唯一索引
- `sn + cycle_no` 唯一索引

### 2.3 warranty_entitlements

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 主键 |
| entitlement_id | string | 权益编号 |
| sale_cycle_id | string | 关联销售周期 |
| sn | string | 冗余 SN |
| entitlement_type | string | `BASE` / `EXTENDED` |
| source_channel | string | 来源渠道 |
| source_order_no | string nullable | 来源订单号 |
| warranty_days | int | 权益天数 |
| status | string | 权益状态 |
| remark | string nullable | 备注 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

约束：

- `sale_cycle_id` 应关联 `sale_cycles.sale_cycle_id`

### 2.4 device_events

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 主键 |
| event_id | string | 事件编号 |
| sn | string | 设备 SN |
| sale_cycle_id | string nullable | 所属周期 |
| event_type | string | 事件类型 |
| event_time | datetime | 事件时间 |
| raw_payload | json / text | 原始事件内容 |
| created_at | datetime | 创建时间 |

## 3. 激活查询契约

### 3.1 统一接口

```ts
interface ActivationQueryService {
  queryBySn(sn: string): Promise<ActivationQueryResult>;
}
```

### 3.2 返回模型

```ts
type ActivationQueryResult = {
  success: boolean;
  data?: {
    sn: string;
    activationStatus: "ACTIVATED" | "NOT_ACTIVATED" | "UNKNOWN";
    activationRecords: Array<{
      activatedAt: string;
      recordType: "CURRENT_CYCLE" | "HISTORY_CYCLE" | "UNKNOWN";
    }>;
  };
  errorCode?: string;
  errorMessage?: string;
};
```

### 3.3 Mock 数据覆盖

首期至少提供：

| SN | 场景 | 预期 |
| --- | --- | --- |
| SN001 | 当前周期已激活，无延保 | 标准保修 |
| SN002 | 当前周期未激活 | 保修未开始 |
| SN003 | 历史激活 + 当前激活，退货重售 | 以当前周期为准 |
| SN004 | 多条激活记录无法判断 | 待人工审核 |
| SN005 | 激活查询失败或超时 | 查询异常 |
| SN006 | 当前周期已激活，延保 180 天 | 在保 |
| SN007 | 当前周期已激活，延保 365 天 | 在保 |
| SN008 | 多个未关闭销售周期 | 待人工审核 |

## 4. 当前有效销售周期判定规则

输入：

- `devices`
- `sale_cycles`
- `device_events`

判定逻辑：

1. 按 `sn` 找到所有周期
2. 过滤 `cycle_closed_at is null` 的周期，得到未关闭周期
3. 若未关闭周期数为 0，返回“无有效销售周期”
4. 若未关闭周期数大于 1，返回“待人工审核”
5. 若仅 1 个未关闭周期，则取该周期为当前有效销售周期
6. 若该周期无 `activated_at`，需继续依赖激活查询结果判定是否已激活

## 5. 当前周期首次激活时间判定规则

输入：

- 当前有效销售周期
- 激活查询结果
- 最近解绑时间

判定逻辑：

1. 若当前周期 `activated_at` 已存在，直接采用
2. 若不存在，则从激活记录中筛选 `activatedAt > unbound_at` 的记录
3. 若无解绑时间，则优先使用被标记为 `CURRENT_CYCLE` 的记录
4. 若候选记录为 0 条，返回未激活或待人工审核
5. 若候选记录为 1 条，认定为当前周期首次激活时间
6. 若候选记录大于 1 条且无法确定唯一记录，返回待人工审核

## 6. 保修判定规则

### 6.1 SN 不存在

输出：

- `decisionStatus = SN_NOT_FOUND`
- `decisionMessage = SN 不存在`

### 6.2 无有效销售周期

输出：

- `decisionStatus = UNSOLD_OR_UNDETERMINED`
- `decisionMessage = 未售 / 无法判定 / 待激活`

### 6.3 当前周期未激活

输出：

- `decisionStatus = NOT_STARTED`
- `decisionMessage = 保修未开始`

### 6.4 当前周期已激活且有有效延保

计算：

- `baseWarrantyDays = 365`
- `extraWarrantyDays = sum(active extended entitlements)`
- `warrantyStartDate = activatedAt`
- `warrantyEndDate = activatedAt + 365 + extraWarrantyDays`

### 6.5 当前周期已激活但无延保记录

计算：

- 先按 365 天输出
- 增加警告：`延保待核验`

### 6.6 异常场景

以下情况返回 `PENDING_MANUAL_REVIEW`：

- 多个未关闭周期
- 激活记录无法归属当前周期
- 激活时间与解绑时间矛盾
- 激活查询返回缺字段
- 数据顺序冲突

### 6.7 查询异常

以下情况返回 `QUERY_ERROR`：

- mock 查询失败
- real 接口超时
- real 接口非预期错误

## 7. API 设计

### 7.1 保修查询

`GET /api/warranty/query?sn={sn}`

响应：

```json
{
  "success": true,
  "data": {
    "sn": "SN003",
    "model": "Pad-X1",
    "deviceStatus": "IN_USE",
    "saleCycleId": "SC202602010001",
    "saleCycleStatus": "ACTIVATED",
    "activatedAt": "2026-02-01T11:00:00+08:00",
    "baseWarrantyDays": 365,
    "extraWarrantyDays": 180,
    "warrantyStartDate": "2026-02-01",
    "warrantyEndDate": "2027-07-31",
    "decisionStatus": "IN_WARRANTY",
    "decisionMessage": "设备在保修期内",
    "basis": [
      "当前有效销售周期已激活",
      "标准保修 365 天",
      "已匹配延保 180 天",
      "历史周期已解绑，不参与当前计算"
    ],
    "warnings": []
  }
}
```

### 7.2 销售周期详情

`GET /api/sale-cycles/:saleCycleId`

返回：

- 周期基础信息
- 关联激活记录
- 权益记录
- 事件日志

### 7.3 权益导入

`POST /api/entitlements/import`

请求：

- `multipart/form-data`
- 支持 `.csv` / `.xlsx`

响应：

```json
{
  "success": true,
  "data": {
    "total": 100,
    "successCount": 96,
    "failedCount": 4,
    "errors": [
      {
        "row": 8,
        "sn": "SN999",
        "message": "设备不存在"
      }
    ]
  }
}
```

## 8. 前端页面契约

### 8.1 查询页

输入：

- `sn`

输出组件：

- 查询表单
- 结果摘要卡
- 判定依据列表
- 警告列表

### 8.2 详情页

展示：

- 当前设备信息
- 周期时间线
- 激活记录表格
- 权益记录表格
- 事件日志表格

### 8.3 管理页

展示：

- 导入按钮
- 导入结果表格
- 样例模板下载
