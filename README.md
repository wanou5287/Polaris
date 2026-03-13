# FinVisPy - 财务报表自动化生成系统

一个基于FastAPI的财务报表自动化生成系统，支持从用友接口拉取数据、数据清洗、Excel模板填充和文件加密压缩。支持一次性下载链接与OSS上传，日志支持文件持久化。

## 系统架构

### 核心流程
1. **数据拉取**: 调用用友API获取凭证数据
2. **数据清洗**: 按科目代码过滤，数据标准化
3. **数据入库**: 存储到SQLite/阿里云RDS
4. **模板填充**: 将数据填入Excel模板
5. **文件处理**: 加密压缩生成最终报表

### 项目结构

```
FinvisPy/
├── main.py                          # 主入口
├── app/
│   ├── core/                        # 核心配置
│   │   ├── config.py               # 配置管理
│   │   ├── database.py             # 数据库连接
│   │   └── logger.py               # 日志管理
│   ├── models/                      # 数据模型
│   │   ├── base.py                 # 基础模型
│   │   └── voucher.py              # 凭证数据模型
│   ├── routes/                      # API路由
│   │   └── financial_report.py     # 财务报表路由（仅保留生成与一次性下载）
│   └── services/                    # 业务服务
│       ├── yonyou_client.py        # 用友API客户端
│       ├── data_fetch_service.py   # 数据拉取服务
│       ├── data_process_service.py # 数据处理服务
│       ├── excel_export_service.py # Excel导出服务
│       ├── report_generate_service.py # 报表生成服务
│       ├── oss_service.py          # OSS存储服务
│       └── notification_service.py # 钉钉通知服务
├── templates/
│   └── report_template.xlsx        # Excel模板
├── output/                         # 统一输出目录
│   ├── excel/                      # Excel文件目录
│   └── zip/                        # ZIP压缩包目录
├── tests/                          # 测试文件
│   └── test_e2e_api.py            # 端到端接口测试（GET触发）
└── requirements.txt                # 依赖配置
```

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 配置环境变量

创建 `.env` 文件：

```env
# 用友API配置
YONYOU_APP_KEY=your_app_key
YONYOU_APP_SECRET=your_app_secret
YONYOU_BASE_URL=https://c3.yonyoucloud.com

# 公司配置
COMPANY_ACCOUNT_CODES=0004,BVIO1,HK01,0002,KY01,0001,0003,000202,000201,000101,000102
SUBJECT_CODES=1001,1002,1012

# 数据库配置（建议MySQL或SQLite，生产使用MySQL）
# MySQL: mysql+pymysql://user:password@host:3306/database

# OSS配置
OSS_BUCKET_NAME=zstt-prod
OSS_REGION=oss-cn-hangzhou
OSS_ENDPOINT=https://oss-cn-hangzhou.aliyuncs.com
OSS_ACCESS_KEY_ID=your_access_key_id
OSS_ACCESS_KEY_SECRET=your_access_secret
OSS_PREFIX=financial-reports/
# 若需公网直链，设为 True；私有桶建议 False
OSS_PUBLIC_READ=False

# 钉钉通知配置（可选）
DINGTALK_WEBHOOK_URL=your_webhook_url
DINGTALK_SECRET=your_secret
```

### 3. 运行应用（本地）

```bash
python main.py
```

### 4. 访问应用

- 应用地址: http://{你的局域网IP}:8888
- API文档: http://{你的局域网IP}:8888/docs
- 健康检查: http://{你的局域网IP}:8888/health

## API接口

### 核心接口

#### 一键生成财务报表（GET）
```http
GET /financial/generate-report?makeTimeStart=2025-09-01&makeTimeEnd=2025-09-30
```

**响应示例:**
```json
{
    "code": 200,
    "message": "财务报表生成任务已启动",
    "data": {
        "makeTimeStart": "2025-09-01",
        "makeTimeEnd": "2025-09-30",
        "status": "started",
        "message": "财务报表生成任务已在后台启动，请稍后在钉钉群机器人接收通知"
    }
}
```

#### 一次性下载链接
生成完成后，系统会推送钉钉消息，包含一次性下载链接：
`http://{你的局域网IP}:8888/financial/one-time-download/{token}`
- 首次访问：302 跳转至 OSS 签名URL并可下载
- 二次访问：提示“链接已失效或不存在”；并自动删除对应 OSS 对象

## 统一返回结构

所有API统一返回：
```json
{
  "code": 200,
  "message": "success",
  "data": { }
}
```
错误时：
```json
{
  "code": 500,
  "message": "错误信息",
  "data": {}
}
```

## 测试

### 运行核心集成测试

```bash
uvicorn main:app --host 0.0.0.0 --port 8888 --reload
```

### 运行用友API测试

```bash
python tests/test_e2e_api.py
```

### 运行数据拉取测试

```bash
curl "http://{你的局域网IP}:8888/financial/generate-report?makeTimeStart=2025-09-01&makeTimeEnd=2025-09-30"
```

## 技术栈

- **FastAPI** - Web框架
- **SQLAlchemy** - ORM数据库操作
- **Pandas** - 数据处理和Excel操作
- **openpyxl** - Excel文件读写
- **pyzipper** - 文件加密压缩
- **requests** - HTTP客户端
- **Pydantic** - 数据验证
- **Uvicorn** - ASGI服务器

## 部署说明

### 本地部署
1. 安装Python 3.8+
2. 安装依赖: `pip install -r requirements.txt`
3. 配置环境变量
4. 运行: `python main.py`

### 生产部署
1. 使用阿里云RDS作为数据库（建议VPC内网）
2. 使用阿里云OSS存储文件（私有桶，签名URL）
3. 配置钉钉通知（Webhook + Secret）
4. 使用Docker或进程守护部署（supervisor/systemd）
5. 日志写入 `logs/app.log`，建议配置日志轮转

## 开发说明

1. **服务层设计**: 各服务类相互独立，可单独测试和复用
2. **数据模型**: 使用SQLAlchemy ORM，支持多种数据库
3. **错误处理**: 统一的异常处理和日志记录
4. **配置管理**: 使用环境变量，支持不同环境配置
5. **测试覆盖**: 核心功能有完整的测试用例

## 文件存储规则

### 目录结构
- `output/excel/` - 存储Excel文件
- `output/zip/` - 存储加密压缩包

### 文件命名规则
- Excel文件：`月度财务报表_{期间}.xlsx`（如：月度财务报表_2025-09.xlsx）
- ZIP文件：`月度财务报表_{期间}.zip`（如：月度财务报表_2025-09.zip）
- 同月份文件会被覆盖，确保每个月份只有一份数据

## 注意事项

1. 用友API有调用频率限制，建议控制并发数
2. 大量数据处理时建议使用后台任务
3. 文件加密使用AES-256，密码随机生成
4. 支持阿里云RDS和OSS，需要配置相应权限
5. 文件按月份存储，同月份文件会被覆盖
