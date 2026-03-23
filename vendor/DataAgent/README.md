# Data Agent

<div align="center">

English | [简体中文](README_CN.md)

</div>

## ✨ Overview

Data Agent is an intelligent data analysis system that automatically completes complex data analysis tasks through multi-agent collaboration. Supports CSV files and databases (MySQL/Doris) as data sources, and can automatically recognize user intent, plan execution steps, invoke tools, and generate analysis reports.

![Project Overview](docs/assets/data_agent.svg)

---

## Demo

**Demo Scenario:** Analyze total sales by product category  
**Test data Sources:** CSV files (`examples/orders.csv`, `examples/products.csv`)

#### 1️⃣ Task Planning & Multi-Agent Collaboration

Recognize user intent to generate execution plan, then route specific tasks to multiple agents.

<div align="center">
  <img src="docs/assets/demo1.png" alt="Intent Recognition & Planning" width="100%">
</div>

<br>

#### 2️⃣ Tool Invocation

Automatically invoke appropriate tools to complete data retrieval and analysis.

<div align="center">
  <img src="docs/assets/demo2.png" alt="Agent Collaboration" width="100%">
</div>

<br>

#### 3️⃣ Professional Report Generation

Aggregate results and generate a comprehensive analysis report.

<div align="center">
  <img src="docs/assets/demo3.png" alt="Report Generation" width="100%">
</div>

---

## 🏗️ System Architecture

<div align="center">
  <img src="docs/assets/FLOW_DIAGRAM_SIMPLE.svg" alt="System Flow Diagram" width="100%">
</div>

---

## 🚀 Key Features

### 🤖 Multi-Agent Collaboration Architecture
- **Plan Agent**: Task planning and execution orchestration with dynamic replanning
- **Sale Agent**: Data retrieval and querying (with MCP tool integration)
- **Analysis Agent**: Data computation and analysis (Python code execution)
- **Report Agent**: Result aggregation and report generation
- **Extensible**: Easily add custom agents (advertising, traffic, user behavior, etc.)

### 💬 Intelligent Conversation Capabilities
- **Multi-turn Conversations**: Context persistence, support for follow-up questions and clarifications
- **Question Rewriting**: Automatically optimizes user questions for better understanding
- **Intent Recognition**: Intelligently distinguishes between small talk and tasks, with automatic routing

### 🔄 ReAct Execution Pattern
- **Think-Act Loop**: Reasoning + Acting with transparent decision-making process
- **Tool Invocation**: Support for MCP (Model Context Protocol) standard tools
- **Code Execution**: Dynamic Python code generation for data processing
- **Error Handling**: Automatic retry, feedback, and replanning mechanisms

### 👤 Human-in-the-Loop Mechanism
- **Smart Interruption**: Proactively asks users when questions are unclear
- **Resumable Execution**: Seamlessly continues after user provides additional information
- **Real-time Feedback**: Execution process is transparent and visible

### 🔍 RAG Enhancement
- **Knowledge Base Integration**: Support for RAGFlow
- **Domain Knowledge**: Automatically retrieves business rules, calculation formulas, etc.
- **Context Enhancement**: Improves accuracy for complex tasks

### 📊 Flexible Data Source Support
- **CSV Files**: Auto-scan and identify column information
- **Databases**: MySQL, Doris, and other MySQL protocol-compatible databases
- **Generic Table Abstraction (MCP)**: Unified dimension/metric/filter query interface
- **Auto-inference**: Automatically identifies dimensions and metrics based on table schema
- **Flexible Configuration**: Support for custom metric formulas, required filters, etc.

### 🎨 Frontend Interface
- **Streamlit UI**: Beautiful web interactive interface
- **Real-time Streaming**: Watch agent execution in real-time
- **Structured Display**: Planning, tool calls, and code execution categorized

---

## 📦 Quick Start

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Create Configuration File

Copy and modify the example configuration:

```bash
cp conf.example.yaml conf.yaml
```

#### Option A: CSV Mode (Recommended for Beginners)
1. Ensure CSV data directory exists (default: `D:/csv_files` on Windows or `/data/csv_files` on Linux)
2. Copy example data files to that directory:
   ```bash
   # Windows
   mkdir D:\csv_files
   copy examples\*.csv D:\csv_files\
   
   # Linux/Mac
   mkdir -p /data/csv_files
   cp examples/*.csv /data/csv_files/
   ```

#### Option B: Database Mode
Configure MySQL connection in `conf.yaml`:

```yaml
database:
  mysql:
    host: "127.0.0.1"
    port: 3306
    user: "your_user"
    password: "your_password"
    database: "your_database"
```

### 3. Start Services

#### Terminal 1: Date Tool Service (Required)
```bash
python -m src.mcp_server.date_mcp_server.server
```
Provides date range calculation (e.g., "last 7 days", "last week")

#### Terminal 2: Generic Table Query Service (Optional - Only when using database tables)
```bash
python -m src.mcp_server.generic_table_mcp.server
```
**Note:** Only start this service if you have configured `tables` under `agents.data_sources.<agent_name>` in `conf.yaml`. If you're only using CSV files, you don't need to start this service.

Provides unified dimension/metric query interface for database tables.

#### Terminal 3: Backend API Service
```bash
python server.py --host 0.0.0.0 --port 10000
```

### 4. Use the System

#### Method 1: Command Line Interface (Quick Test)
```bash
python test_api.py
```

#### Method 2: Web Interface (Recommended)
```bash
streamlit run streamlit_app.py
```
Then open http://localhost:8501 in your browser

---

## ⚙️ Configuration Guide (conf.yaml)

See `conf.example.yaml` for example file. Core structure:

- `app`: General runtime parameters
  - `locale`: Interface/output language
  - `max_steps/max_retry_count/max_replan_count/plan_temperature`: PlanAgent parameter configuration
  - `query_limit`: Maximum number of rows returned for generic table queries
  - `workspace_directory`: Session workspace root path
  - `csv_data_directory`: CSV data directory, system will scan this directory to analyze file headers and column information

- `llm`: Configure models by "agent name"
  - Each item supports `base_url/model/api_key`

- `database.mysql`: Database connection used for generic table queries (for Schema inference/SQL execution)

- `agents.capabilities`: Description of each sub-agent's capabilities, PlanAgent references this for task decomposition and routing

- `agents.data_sources`: Data source declaration for each agent
  - `csv`: Filenames existing in `app.csv_data_directory` (for data source description and column info display)
  - `tables`: Database tables for generic table queries (list of table configurations)
    - Each table configuration requires:
      - `database`: Database name (required)
      - `table`: Table name (required)
      - `mcp`: Optional MCP metadata configuration
        - If `mcp` field is omitted: System will auto-infer dimensions/metrics based on table schema
        - If `mcp` is provided:
          - `dimensions`: Dimension definitions (English field → description)
          - `metrics`: Metric definitions (`function: sum|avg|count|max|min` or `formula` calculation expression)
          - `required_filters`: Required filter dimensions (e.g., `part_dt`)
          - `value_mappings`: Dimension value alias mapping (e.g., `site.GB → ["GB","GLOBAL"]`)
          - `field_hints`: Field value/format hints (Agent will call `get_table_schema` before querying for hints)

- `ragflow`: RAG service configuration
  - `base_url`: RAGFlow service address
  - `api_key`: RAGFlow API key
  - `datasets`: Dataset mapping (`agent_name → dataset_id`). PlanAgent selects appropriate dataset based on agent name for retrieval.

See `conf.example.yaml` for complete configuration examples.

---

## 🛠️ Advanced Features

### How to Add a Custom Agent

The following steps demonstrate how to add a new sub-agent named `product_agent` and make it schedulable by the planner.

1. Create file: `src/agents/product_agent.py`  
Example (similar to `sale_agent`, inherit from `ReActAgentBase`, integrate MCP services and tools as needed):
```python
class ProductAgent(ReActAgentBase):
    def __init__(self, agent_name: str):
        # Load configuration to check if tables and CSV are configured
        config = load_yaml_config("conf.yaml")
        data_sources = config.get("agents", {}).get("data_sources", {}).get(agent_name, {})
        tables_config = data_sources.get("tables", [])
        csv_config = data_sources.get("csv", [])
        
        # Build MCP servers dict conditionally
        mcp_servers = {
            "date": {
                "url": "http://localhost:9095/sse",
                "transport": "sse",
            }
        }
        
        # Only add table MCP service if tables are configured
        if tables_config:
            mcp_servers["table"] = {
                "url": "http://localhost:9100/sse",
                "transport": "sse",
            }
        
        # Store CSV configuration flag for later use in run method
        self.has_csv_config = bool(csv_config)
        
        super().__init__(
            agent_name=agent_name,
            # If you need generic table/date tools, configure corresponding MCP services here.
            # The table MCP service is automatically added only when tables are configured in conf.yaml.
            # You can also add other MCP services needed by this agent.
            mcp_servers=mcp_servers,
            max_iterations=10,
            react_llm="react_agent",
        )

    async def run(self, state: StepState, config: RunnableConfig):
        push_message(HumanMessage(content=f"Routing to: {self.agent_name}", id=f"record-{str(uuid.uuid4())}"))
        self.workspace_directory = state["workspace_directory"]
        self.current_step = state["current_step"]

        tools = await super().build_tools()
        tools.append(run_python_code)  # If you need code computation
        
        # Add list_available_csv_files tool if CSV files are configured
        if self.has_csv_config:
            tools.append(list_available_csv_files)
        
        self.tools = tools

        res = await self._execute_agent_step(step_state=state, config=config)
        return {"execute_res": res}
```
2. Register scheduling tool in the planner: Open `src/agents/plan_agent.py`, add during initialization:
```python
from src.utils.agent_utils import create_task_description_handoff_tool
from src.agents.product_agent import ProductAgent

self.agent_tools = [
    create_task_description_handoff_tool(agent=SaleAgent(agent_name="sale_agent")),
    create_task_description_handoff_tool(agent=AnalysisAgent(agent_name="analysis_agent")),
    create_task_description_handoff_tool(agent=ProductAgent(agent_name="product_agent")),  # New addition
]
```

3. Declare capabilities and data sources in configuration: `conf.yaml`
```yaml
agents:
  capabilities:
    product_agent:
      capabilities:
        - "Data retrieval and analysis by product dimension"
  data_sources:
    product_agent:
      csv:
        - "products.csv"
      tables:
        # Optional: If you need generic table queries, configure mcp metadata as needed (or leave empty for auto-inference)
        # - database: "analytics"
        #   table: "dim_product"
        #   mcp: { ... }
```

4. (Optional) Add dedicated dataset for RAG: `ragflow.datasets.product_agent: "<dataset_id>"`

5. Prompts: Most sub-agents share the ReAct template from `src/prompts/react_agent.md`, no need to add new prompts. If customization is needed, you can assemble messages or extend templates in `run()`.

Once completed, PlanAgent will automatically select `product_agent` as the executor for certain steps when generating plans (provided your capability description and data source declaration support the task).
