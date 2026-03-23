import json
from pathlib import Path
from typing import Dict, Any, List

import mysql.connector
from mcp.server.fastmcp import FastMCP

from src.config.loader import load_yaml_config
from src.mcp_server.common import (
    ParameterParser,
    QueryRequest,
    UniversalQueryBuilder,
    QueryExecutor,
    ConfigBackedRegistry,
    DB_CONFIG,
    logger,
    safe_json_dumps,
)

# ==================== Generic Table MCP ====================

mcp_tables = FastMCP("Tables", port=9100)


def _config_path() -> str:
    return str((Path(__file__).resolve().parents[3] / 'conf.yaml'))


def _get_query_limit() -> int:
    """
    Get query limit from conf.yaml: app.query_limit
    Default to 1000000 if not configured
    """
    try:
        conf = load_yaml_config(_config_path())
        app_conf = conf.get("app", {}) or {}
        limit = app_conf.get("query_limit", 1000000)
        return int(limit)
    except Exception as e:
        logger.warning(f"Failed to load query_limit from config, using default 1000000: {e}")
        return 1000000


def _load_tables_index() -> Dict[str, List[Dict[str, Any]]]:
    """
    Build an index by agent. Tables may include nested 'mcp' overrides.
    If none provided, dimensions/metrics will be inferred.
    """
    conf = load_yaml_config(_config_path())
    data_sources = conf.get("agents", {}).get("data_sources", {}) or {}
    result: Dict[str, List[Dict[str, Any]]] = {}

    for agent_name, ds in data_sources.items():
        tables = ds.get("tables", []) or []
        indexed: List[Dict[str, Any]] = []
        for t in tables:
            # Compatibility: allow nested 'mcp' details; flatten relevant keys
            mcp_meta = t.get("mcp", {}) or {}
            db = t.get("database")
            table = t.get("table")
            cfg = {
                "database": db,
                "table": table,
                "dimensions": mcp_meta.get("dimensions"),
                "metrics": mcp_meta.get("metrics"),
                "fixed_filters": mcp_meta.get("fixed_filters"),
                "required_filters": mcp_meta.get("required_filters"),
                "value_mappings": mcp_meta.get("value_mappings"),
                "field_hints": mcp_meta.get("field_hints"),
            }
            indexed.append(cfg)
        result[agent_name] = indexed

    return result


def _load_tables_flat() -> List[Dict[str, Any]]:
    """
    Flatten all tables across agents to a single list.
    """
    idx = _load_tables_index()
    all_tables: List[Dict[str, Any]] = []
    for _agent, tbls in idx.items():
        all_tables.extend(tbls)
    return all_tables


def _find_table_cfg(table: str) -> Dict[str, Any]:
    """
    Find table config by:
      - exact match on 'database.table' if dot is present
      - otherwise by 'table' name; if ambiguous across multiple databases, raise an error
    """
    tables = _load_tables_flat()
    if "." in table:
        for t in tables:
            full = f"{t.get('database')}.{t.get('table')}" if t.get("database") else t.get("table")
            if full == table:
                return t
        raise ValueError(f"Table '{table}' not found")

    candidates = [t for t in tables if t.get("table") == table]
    if not candidates:
        raise ValueError(f"Table '{table}' not found")
    if len(candidates) > 1:
        opts = [f"{c.get('database')}.{c.get('table')}" if c.get('database') else c.get('table') for c in candidates]
        raise ValueError(f"Table '{table}' is ambiguous. Use one of: {', '.join(opts)}")
    return candidates[0]


def _fetch_table_comment(database: str, table: str) -> str | None:
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cur = conn.cursor()
        # information_schema is standard; TABLE_COMMENT holds comment if present
        cur.execute(
            "SELECT TABLE_COMMENT FROM information_schema.tables WHERE TABLE_SCHEMA=%s AND TABLE_NAME=%s",
            (database, table)
        )
        row = cur.fetchone()
        cur.close()
        conn.close()
        return row[0] if row and row[0] else None
    except Exception as e:
        logger.warning(f"Fetch table comment failed for {database}.{table}: {e}")
        return None


@mcp_tables.tool()
async def list_available_table_sources() -> str:
    """
    List all configured database tables available for querying.
    Returns table names and their comments (if available).
    """
    idx = _load_tables_index()
    tables = []
    for _agent, tbls in idx.items():
        for t in tbls:
            db = t.get("database")
            tb = t.get("table")
            full = f"{db}.{tb}" if db else tb
            comment = _fetch_table_comment(db, tb) if db and tb else None
            tables.append({
                "full_name": full,
                "comment": comment
            })

    payload = {
        "tables": tables
    }
    return json.dumps(payload, ensure_ascii=False, indent=2)


@mcp_tables.tool()
async def get_table_schema(table: str) -> str:
    """
    Get complete table schema including dimensions, metrics, and field hints.
    This is the RECOMMENDED tool to call BEFORE querying a table.
    
    Returns:
      - table: Full table name
      - dimensions: Available dimension fields with descriptions
      - metrics: Available metric fields with descriptions and aggregation functions
      - field_hints: Format requirements and value options for fields (if configured)
      - required_filters: Fields that MUST be included in filters (if any)
    
    Args:
      table: Table identifier. Accepts "database.table" or a bare table name if unique.
    
    Example workflow:
      1. Call get_table_schema(table) to understand table structure and requirements
      2. Call query_table_data() with properly formatted parameters
    """
    try:
        cfg = _find_table_cfg(table)
        registry = ConfigBackedRegistry(cfg)
        dims = registry.get_all_dimensions()
        mets = registry.get_all_metrics()
        field_hints = registry.get_field_hints()
        required_filters = registry.get_required_filter_fields()
        
        metrics_info = {
            name: {
                "description": metric.description,
                "function": metric.aggregate_func.value if not metric.formula else metric.formula
            }
            for name, metric in mets.items()
        }
        
        result = {
            "table": registry.get_table_name(),
            "dimensions": dims,
            "metrics": metrics_info
        }
        
        # Add field_hints if available
        if field_hints:
            result["field_hints"] = field_hints
            result["hint_note"] = "Please follow the format and value requirements specified in field_hints when querying"
        
        # Add required_filters if any
        if required_filters:
            result["required_filters"] = required_filters
            result["required_note"] = f"The following fields are REQUIRED in filters: {', '.join(required_filters)}"
        
        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"Failed to get table schema: {e}", exc_info=True)
        return json.dumps({
            "success": False,
            "message": f"Failed to get table schema: {str(e)}"
        }, ensure_ascii=False, indent=2)


@mcp_tables.tool()
async def query_table_data(
    workspace_directory: str,
    table: str,
    dimensions: str,
    metrics: str = "",
    filters: str = "",
    order_by: str = ""
) -> str:
    """
    Query any configured table with flexible dimensions, metrics, filters, and sorting.

    IMPORTANT WORKFLOW:
      1. First call get_table_schema(table) to get available fields and format requirements
      2. Then call this function with properly formatted parameters

    Parameters:
      workspace_directory: Output directory for the generated CSV file.
      table: Table identifier. Accepts "database.table" or a bare table name if unique.
      dimensions: Comma-separated dimension field names, e.g. "dt,site,sku".
      metrics: Comma-separated metric names, e.g. "sales_revenue,finance_purchase_cost,ratio_metric".
               Metrics may be base metrics (with aggregate function) or derived metrics (configured by formula).
      filters: JSON string array of filter objects:
               [{"field":"<name>","operator":"eq|gt|ge|lt|le|in","value":<string|number|array>}]
               Operators:
                 - eq, gt, ge, lt, le: value is a string/number
                 - in: value is an array of strings/numbers (length < 10)
               IMPORTANT: Field values must match formats specified in field_hints from get_table_schema()
      order_by: JSON string object mapping field -> ASC|DESC, e.g. {"sales_revenue":"desc","dt":"asc"}.

    Notes:
      - filters and order_by must be JSON strings.
      - dimensions and metrics are comma-separated strings.
      - Always check get_table_schema() first for field_hints and required_filters
      - Field values must match exact formats specified in field_hints
    """
    try:
        parser = ParameterParser()
        cfg = _find_table_cfg(table)
        registry = ConfigBackedRegistry(cfg)

        request = QueryRequest(
            workspace_directory=workspace_directory,
            dimensions=parser.parse_list(dimensions),
            metrics=parser.parse_list(metrics),
            filters=parser.parse_filters(filters),
            order_by=parser.parse_order_by(order_by),
            limit=_get_query_limit()
        )

        builder = UniversalQueryBuilder(request, registry)
        executor = QueryExecutor(DB_CONFIG)
        result = executor.execute(builder)
        return safe_json_dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"Generic query failed: {e}", exc_info=True)
        return safe_json_dumps({
            "success": False,
            "message": f"Query failed: {str(e)}",
            "data": None
        }, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    logger.info("Start the universal table data MCP service (port: 9100)...")
    mcp_tables.run(transport="sse")

