import json
import logging
import os
import uuid
from pathlib import Path
from typing import List, Dict, Any, Optional
from enum import Enum
from dataclasses import dataclass, field
from abc import ABC, abstractmethod
from decimal import Decimal
from datetime import datetime, date
import platform
from functools import lru_cache

import mysql.connector

from src.config.loader import load_yaml_config

# ==================== Configuration ====================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Database configuration - Load from config file
def _load_db_config() -> Dict[str, Any]:
    """Load database configuration from config file"""
    config_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'conf.yaml')
    config = load_yaml_config(config_path)
    db_config = config.get('database', {}).get('mysql', {})
    
    if not db_config:
        logger.warning("Database configuration not found")
        raise ValueError("Database configuration not found")
    
    return db_config

DB_CONFIG = _load_db_config()

SYSTEM = platform.system()

# ==================== JSON Serialization Tools ====================

class DecimalEncoder(json.JSONEncoder):
    """Custom JSON encoder to handle Decimal, datetime and other types"""
    def default(self, obj):
        if isinstance(obj, Decimal):
            # Convert Decimal to float, if it's an integer convert to int
            if obj % 1 == 0:
                return int(obj)
            return float(obj)
        elif isinstance(obj, (datetime, date)):
            return obj.isoformat()
        return super(DecimalEncoder, self).default(obj)


def safe_json_dumps(obj: Any, **kwargs) -> str:
    """Safe JSON serialization, automatically handles Decimal and other types"""
    return json.dumps(obj, cls=DecimalEncoder, **kwargs)


# ==================== Enum Definitions ====================

class Operator(str, Enum):
    """Comparison operators"""
    EQ = "eq"
    GT = "gt"
    GE = "ge"
    LT = "lt"
    LE = "le"
    IN = "in"


class AggregateFunc(str, Enum):
    """Aggregate functions"""
    SUM = "sum"
    AVG = "avg"
    COUNT = "count"
    MAX = "max"
    MIN = "min"


# ==================== Data Class Definitions ====================

@dataclass
class FilterCondition:
    """Filter condition"""
    field: str
    operator: Operator
    value: Any

    def to_sql(self, is_indicator: bool = False) -> str:
        """Convert to SQL condition"""
        if self.operator == Operator.IN:
            values = self.value if isinstance(self.value, list) else [self.value]
            quoted_values = [f"'{v}'" for v in values]
            if len(quoted_values) >= 10:
                raise OverflowError("Exceeds filter threshold of 10: When filtering by large lists (>=10 items), retrieve full dataset once and filter locally rather than making excessive parameterized calls")
            return f"{self.field} IN ({','.join(quoted_values)})"

        val = f"'{self.value}'" if not is_indicator else self.value

        if self.operator == Operator.EQ:
            return f"{self.field} = {val}"
        elif self.operator == Operator.GT:
            return f"{self.field} > {val}"
        elif self.operator == Operator.GE:
            return f"{self.field} >= {val}"
        elif self.operator == Operator.LT:
            return f"{self.field} < {val}"
        elif self.operator == Operator.LE:
            return f"{self.field} <= {val}"
        return None


@dataclass
class MetricDefinition:
    """Metric definition"""
    name: str  # Metric name
    description: str  # Metric description
    aggregate_func: AggregateFunc = AggregateFunc.SUM  # Aggregate function
    formula: Optional[str] = None  # Calculation formula (for derived metrics)


@dataclass
class QueryRequest:
    """Query request object"""
    workspace_directory: str
    dimensions: List[str] = field(default_factory=list)
    metrics: List[str] = field(default_factory=list)
    filters: List[FilterCondition] = field(default_factory=list)
    order_by: Dict[str, str] = field(default_factory=dict)
    limit: int = 1000000


# ==================== Abstract Registry Base Class ====================

class BaseRegistry(ABC):
    """Registry base class - now instance-based"""

    @abstractmethod
    def get_all_dimensions(self) -> Dict[str, str]:
        """Get all dimensions"""
        pass

    @abstractmethod
    def get_all_metrics(self) -> Dict[str, MetricDefinition]:
        """Get all metrics"""
        pass

    @abstractmethod
    def get_table_name(self) -> str:
        """Get table name"""
        pass

    def get_dimension_value_mapping(self) -> Dict[str, Dict[str, List[str]]]:
        """Get dimension value mapping (for alias handling)"""
        return {}

    def get_fixed_filters(self) -> List[str]:
        """Get fixed filter conditions"""
        return ["1=1"]

    def get_required_filter_fields(self) -> List[str]:
        """Get required filter dimension fields list (can be overridden by business logic)"""
        return []

    def validate_dimensions(self, dimensions: List[str]) -> tuple[bool, str]:
        """Validate dimension fields"""
        if not dimensions:
            return False, "At least one dimension field is required"
        available = self.get_all_dimensions()
        invalid = [d for d in dimensions if d not in available]
        if invalid:
            return False, f"Invalid dimension fields: {', '.join(invalid)}"
        return True, ""

    def validate_metrics(self, metrics: List[str]) -> tuple[bool, str]:
        """Validate metric fields"""
        if not metrics:
            return True, ""
        available = self.get_all_metrics()
        invalid = [m for m in metrics if m not in available]
        if invalid:
            return False, f"Invalid metric fields: {', '.join(invalid)}"
        return True, ""

    def validate_filters(self, filters: List[FilterCondition]) -> tuple[bool, str]:
        """Validate fields in filter conditions"""
        if not filters:
            # When no filter conditions are passed, also need to check if required filter fields are missing
            required_fields = self.get_required_filter_fields()
            if required_fields:
                return False, f"Missing required filter fields: {', '.join(required_fields)}"
            return True, ""
        
        available_dimensions = self.get_all_dimensions()
        available_metrics = self.get_all_metrics()
        all_valid_fields = set(available_dimensions.keys()) | set(available_metrics.keys())
        
        invalid = []
        for filter_cond in filters:
            if filter_cond.field not in all_valid_fields:
                invalid.append(filter_cond.field)
        
        if invalid:
            invalid_fields = list(set(invalid))
            return False, f"Filter conditions contain invalid fields: {', '.join(invalid_fields)}"

        # Validate if required filter fields are provided
        required_fields = self.get_required_filter_fields()
        if required_fields:
            provided_fields = {f.field for f in filters}
            missing = [f for f in required_fields if f not in provided_fields]
            if missing:
                return False, f"Missing required filter fields: {', '.join(missing)}"
        return True, ""

    def validate_order_by(self, order_by: Dict[str, str]) -> tuple[bool, str]:
        """Validate sort fields"""
        if not order_by:
            return True, ""
        
        available_dimensions = self.get_all_dimensions()
        available_metrics = self.get_all_metrics()
        all_valid_fields = set(available_dimensions.keys()) | set(available_metrics.keys())
        
        invalid = []
        for field in order_by.keys():
            if field not in all_valid_fields:
                invalid.append(field)
        
        if invalid:
            return False, f"Sort conditions contain invalid fields: {', '.join(invalid)}"
        return True, ""

    def expand_filter_values(self, field: str, values: List[str]) -> List[str]:
        """Expand filter values (handle aliases)"""
        mapping = self.get_dimension_value_mapping()
        if field not in mapping:
            return values

        expanded = []
        field_mapping = mapping[field]
        for value in values:
            if value in field_mapping:
                expanded.extend(field_mapping[value])
            else:
                expanded.append(value)
        return list(set(expanded))


# ==================== Universal Query Builder ====================

class UniversalQueryBuilder:
    """Universal query builder - accepts a BaseRegistry instance"""

    def __init__(self, request: QueryRequest, registry: BaseRegistry):
        """
        Initialize query builder
        
        Args:
            request: QueryRequest object with dimensions, metrics, filters, etc.
            registry: BaseRegistry instance (e.g., ConfigBackedRegistry instance)
        """
        self.request = request
        self.registry = registry
        self.validate()

    def validate(self):
        """Validate query request"""
        if not self.request.workspace_directory:
            raise ValueError("workspace_directory is required")

        valid, msg = self.registry.validate_dimensions(self.request.dimensions)
        if not valid:
            raise ValueError(msg)

        valid, msg = self.registry.validate_metrics(self.request.metrics)
        if not valid:
            raise ValueError(msg)

        valid, msg = self.registry.validate_filters(self.request.filters)
        if not valid:
            raise ValueError(msg)

        valid, msg = self.registry.validate_order_by(self.request.order_by)
        if not valid:
            raise ValueError(msg)

    def build_where_clause(self) -> tuple[List[str], List[str]]:
        """Build WHERE clause, returns (dimension_conditions, metric_conditions)"""
        dimension_conditions = self.registry.get_fixed_filters()
        indicator_conditions = []

        all_metrics = self.registry.get_all_metrics()

        for filter_cond in self.request.filters:
            is_indicator = filter_cond.field in all_metrics

            # Handle dimension value expansion (e.g., site aliases)
            if not is_indicator and filter_cond.operator == Operator.IN:
                expanded_values = self.registry.expand_filter_values(
                    filter_cond.field,
                    filter_cond.value if isinstance(filter_cond.value, list) else [filter_cond.value]
                )
                filter_cond.value = expanded_values

            sql_condition = filter_cond.to_sql(is_indicator)
            if is_indicator:
                indicator_conditions.append(sql_condition)
            else:
                dimension_conditions.append(sql_condition)

        return dimension_conditions, indicator_conditions

    def build_select_clause(self) -> str:
        """Build SELECT clause"""
        dimensions_sql = ", ".join(self.request.dimensions)
        all_metrics = self.registry.get_all_metrics()
        metrics_to_query = self.request.metrics if self.request.metrics else []
        if len(metrics_to_query) > 0:
            metric_sqls = []
            for metric_name in metrics_to_query:
                metric_def = all_metrics[metric_name]

                if metric_def.formula:
                    # Derived metric, use formula directly
                    metric_sqls.append(f"{metric_def.formula} AS `{metric_name}`")
                else:
                    # Base metric, use aggregate function
                    func = metric_def.aggregate_func.value.upper()
                    metric_sqls.append(f"{func}({metric_name}) AS {metric_name}")
            metrics_sql = ",\n    ".join(metric_sqls)
            return f"{dimensions_sql},\n    {metrics_sql}"
        else:
            return dimensions_sql

    def build_order_by_clause(self) -> str:
        """Build ORDER BY clause"""
        if not self.request.order_by:
            return ""

        order_items = [f"{field} {direction}" for field, direction in self.request.order_by.items()]
        return f"ORDER BY {', '.join(order_items)}"

    def build_sql(self) -> str:
        """Build SQL query"""
        select_clause = self.build_select_clause()
        dimension_conditions, indicator_conditions = self.build_where_clause()
        group_by_sql = ", ".join(self.request.dimensions)
        order_by_sql = self.build_order_by_clause()
        table_name = self.registry.get_table_name()

        indicator_where = f"AND {' AND '.join(indicator_conditions)}" if indicator_conditions else ""

        sql = f"""
        SELECT *
        FROM (
            SELECT 
                {select_clause}
            FROM {table_name}
            WHERE {' AND '.join(dimension_conditions)}
            GROUP BY {group_by_sql}
        ) t
        WHERE 1=1
        {indicator_where}
        {order_by_sql}
        LIMIT {self.request.limit}
        """

        return sql


# ==================== Query Executor ====================

class QueryExecutor:
    """Query executor"""

    def __init__(self, db_config: Dict[str, Any]):
        self.db_config = db_config

    def get_connection(self):
        return mysql.connector.connect(**self.db_config)

    def execute(self, builder: UniversalQueryBuilder) -> Dict[str, Any]:
        """Execute query"""
        try:
            sql = builder.build_sql()
            logger.info(f"Executing SQL:\n{sql}")

            connection = self.get_connection()
            cursor = connection.cursor(dictionary=True)
            cursor.execute(sql)
            records = cursor.fetchall()
            cursor.close()
            connection.close()

            logger.info(f"Retrieved {len(records)} records")

            if not records:
                return {
                    "success": False,
                    "message": "No data found",
                    "data": None
                }

            file_path = self._save_to_csv(
                builder.request.workspace_directory,
                records
            )

            # Build dimension information (with descriptions)
            all_dimensions = builder.registry.get_all_dimensions()
            dimensions_info = {
                dim: all_dimensions.get(dim, dim)
                for dim in builder.request.dimensions
            }

            # Build metric information (with descriptions)
            all_metrics = builder.registry.get_all_metrics()
            metrics_list = builder.request.metrics if builder.request.metrics else []
            metrics_info = {
                metric: all_metrics[metric].description
                for metric in metrics_list if metric in all_metrics
            }

            return {
                "success": True,
                "message": "Query succeeded",
                "data": {
                    "columns": list(records[0].keys()),
                    "dimensions": dimensions_info,
                    "metrics": metrics_info,
                    "total_rows": len(records),
                    "file_path": file_path,
                    "file_format": "csv",
                    "separator": "^",
                    "currency": "CNY"
                }
            }

        except Exception as e:
            logger.error(f"Query failed: {e}", exc_info=True)
            return {
                "success": False,
                "message": f"Query failed: {str(e)}",
                "data": None
            }

    def _save_to_csv(self, workspace_dir: str, records: List[Dict]) -> str:
        """Save data to CSV file"""
        if not records:
            raise ValueError("No data to save")

        columns = list(records[0].keys())

        csv_lines = []
        csv_lines.append("^".join(columns))

        for record in records:
            values = []
            for col in columns:
                value = record.get(col, "")
                if value is None:
                    value = ""
                value = str(value).replace("\r\n", " ").replace("\n", " ")

                values.append(value)
            csv_lines.append("^".join(values))

        file_path = os.path.join(Path(workspace_dir), f"{uuid.uuid4()}.csv")
        if SYSTEM == "Windows":
            file_path = f"{workspace_dir}/{uuid.uuid4()}.csv"

        with open(file_path, 'w', encoding='utf-8') as f:
            f.write("\n".join(csv_lines))

        return file_path


# ==================== Parameter Parser ====================

class ParameterParser:
    """Parameter parser"""

    @staticmethod
    def parse_list(value: str) -> List[str]:
        """Parse list parameter (comma-separated)"""
        if not value:
            return []
        return [v.strip() for v in value.split(",") if v.strip()]

    @staticmethod
    def parse_filters(filters: str) -> List[FilterCondition]:
        """Parse filter conditions"""
        if not filters:
            return []

        filters_data = json.loads(filters)
        result = []
        for f in filters_data:
            result.append(FilterCondition(
                field=f["field"],
                operator=Operator(f["operator"]),
                value=f["value"]
            ))
        return result

    @staticmethod
    def parse_order_by(order_by: str) -> Dict[str, str]:
        """Parse sort conditions"""
        if not order_by:
            return {}
        return json.loads(order_by)


# ==================== Config-backed Registry & Introspection ====================

_NUMERIC_TYPES = (
    "tinyint", "smallint", "mediumint", "int", "integer", "bigint",
    "float", "double", "decimal", "numeric", "real"
)


def _is_numeric_type(type_str: str) -> bool:
    t = (type_str or "").lower()
    # Strip size/precision, e.g., decimal(10,2)
    base = t.split("(")[0].strip()
    return base in _NUMERIC_TYPES


@lru_cache(maxsize=128)
def introspect_table_schema(table_name: str) -> Dict[str, Any]:
    """
    Introspect table schema and return columns with basic typing.
    Result:
      {
        "columns": [
           {"name": "col", "type": "varchar(255)", "is_numeric": False},
           ...
        ],
        "dimensions": {"col": "col", ...},   # inferred
        "metrics": {"num_col": {"aggregate_func": "sum", "description": "num_col"}, ...}  # inferred
      }
    """
    try:
        # db_config_key is used for cache key stability; actual config is loaded from global DB_CONFIG
        connection = mysql.connector.connect(**DB_CONFIG)
        cursor = connection.cursor(dictionary=True)
        cursor.execute(f"DESCRIBE {table_name}")
        rows = cursor.fetchall()
        cursor.close()
        connection.close()

        columns = []
        for row in rows:
            # MySQL/Doris return keys: Field, Type, Null, Key, Default, Extra
            col_name = row.get("Field") or row.get("COLUMN_NAME")
            col_type = row.get("Type") or row.get("COLUMN_TYPE") or ""
            is_num = _is_numeric_type(col_type)
            columns.append({"name": col_name, "type": col_type, "is_numeric": is_num})

        # Infer: numeric -> metric (SUM), others -> dimension
        inferred_dimensions: Dict[str, str] = {}
        inferred_metrics: Dict[str, Dict[str, Any]] = {}
        for col in columns:
            if col["is_numeric"]:
                inferred_metrics[col["name"]] = {
                    "aggregate_func": AggregateFunc.SUM.value,
                    "description": col["name"]
                }
            else:
                inferred_dimensions[col["name"]] = col["name"]

        return {
            "columns": columns,
            "dimensions": inferred_dimensions,
            "metrics": inferred_metrics
        }
    except Exception as e:
        logger.error(f"Schema introspection failed for {table_name}: {e}", exc_info=True)
        return {
            "columns": [],
            "dimensions": {},
            "metrics": {}
        }


class ConfigBackedRegistry(BaseRegistry):
    """
    A generic registry that reads table, dimensions, metrics and constraints from configuration,
    with automatic schema introspection fallback.
    """

    def __init__(self, table_config: Dict[str, Any]):
        """
        table_config example:
        {
          "database": "ads",
          "table": "table_name",
          "dimensions": { "part_dt": "date", "sku": "SKU" },                                # optional
          "metrics": { "sales_revenue": {"description": "...", "function": "sum"},
                       "ratio": {"formula": "..."} },                                   # optional
          "fixed_filters": ["1=1"],                                                    # optional
          "required_filters": ["dt_type"],                        # optional
          "value_mappings": { "site": {"GB": ["GB","GLOBAL"]} },  # optional
          "field_hints": { "dt": "Date format: YYYY-MM-DD" }      # optional
        }
        """
        self._cfg = table_config or {}
        self._table_full_name = self._build_table_full_name()
        self._dimensions: Optional[Dict[str, str]] = None
        self._metrics: Optional[Dict[str, MetricDefinition]] = None
        self._value_mappings: Dict[str, Dict[str, list]] = self._cfg.get("value_mappings", {}) or {}
        self._fixed_filters: list[str] = self._cfg.get("fixed_filters", []) or []
        self._required_filters: list[str] = self._cfg.get("required_filters", []) or []
        self._field_hints: Dict[str, str] = self._cfg.get("field_hints", {}) or {}

    def _build_table_full_name(self) -> str:
        database = self._cfg.get("database")
        table = self._cfg.get("table")
        if not table:
            raise ValueError("table_config.table is required")
        return f"{database}.{table}" if database else table

    def _ensure_built(self):
        if self._dimensions is not None and self._metrics is not None:
            return

        configured_dimensions: Dict[str, str] = self._cfg.get("dimensions") or {}
        configured_metrics: Dict[str, Any] = self._cfg.get("metrics") or {}

        # Build from config if present; otherwise infer
        if configured_dimensions or configured_metrics:
            dims = {k: v for k, v in configured_dimensions.items()}
            mets: Dict[str, MetricDefinition] = {}
            for name, meta in configured_metrics.items():
                # meta: {"description": "...", "function": "sum"} OR {"formula": "..."}
                description = meta.get("description", name)
                formula = meta.get("formula")
                if formula:
                    mets[name] = MetricDefinition(name=name, description=description, formula=formula)
                else:
                    func = meta.get("function", AggregateFunc.SUM.value).lower()
                    mets[name] = MetricDefinition(
                        name=name,
                        description=description,
                        aggregate_func=AggregateFunc(func)
                    )
            self._dimensions = dims
            self._metrics = mets
        else:
            # Introspect
            schema = introspect_table_schema(self._table_full_name)
            inferred_dims = schema.get("dimensions", {})
            inferred_mets_cfg = schema.get("metrics", {})
            mets: Dict[str, MetricDefinition] = {}
            for mname, mmeta in inferred_mets_cfg.items():
                desc = mmeta.get("description", mname)
                func = mmeta.get("aggregate_func", AggregateFunc.SUM.value)
                mets[mname] = MetricDefinition(
                    name=mname,
                    description=desc,
                    aggregate_func=AggregateFunc(func)
                )
            self._dimensions = inferred_dims
            self._metrics = mets

        # Always append defaults to fixed filters
        defaults = super().get_fixed_filters()
        merged_fixed = list(dict.fromkeys([*defaults, *self._fixed_filters]))
        self._fixed_filters = merged_fixed

    # ---- BaseRegistry implementations (instance methods)
    def get_all_dimensions(self) -> Dict[str, str]:
        """Get all dimensions"""
        self._ensure_built()
        return self._dimensions or {}

    def get_all_metrics(self) -> Dict[str, MetricDefinition]:
        """Get all metrics"""
        self._ensure_built()
        return self._metrics or {}
    
    def get_table_name(self) -> str:
        """Get table name"""
        return self._table_full_name

    def get_dimension_value_mapping(self) -> Dict[str, Dict[str, List[str]]]:
        """Get dimension value mapping (for alias handling)"""
        return self._value_mappings

    def get_fixed_filters(self) -> List[str]:
        """Get fixed filter conditions"""
        self._ensure_built()
        return self._fixed_filters

    def get_required_filter_fields(self) -> List[str]:
        """Get required filter dimension fields list"""
        return self._required_filters

    def get_field_hints(self) -> Dict[str, str]:
        """Get field hints for format and value options"""
        return self._field_hints
