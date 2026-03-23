import json
import logging
from typing import Dict, List, Any, Optional

import pymysql
from pymysql.cursors import DictCursor

logger = logging.getLogger(__name__)


def get_mysql_connection(host: str, port: int, user: str, password: str, database: str):
    """
    Create MySQL database connection
    
    Args:
        host: Database host address
        port: Database port
        user: Database username
        password: Database password
        database: Database name
        
    Returns:
        pymysql.Connection object
    """
    try:
        connection = pymysql.connect(
            host=host,
            port=port,
            user=user,
            password=password,
            database=database,
            charset='utf8mb4',
            cursorclass=DictCursor
        )
        return connection
    except Exception as e:
        logger.error(f"Failed to connect to MySQL database: {e}")
        return None


def get_table_column_info(connection, database: str, table: str) -> Optional[Dict[str, Any]]:
    """
    Get MySQL table column information and comments
    
    Args:
        connection: MySQL connection object
        database: Database name
        table: Table name
        
    Returns:
        Dictionary containing table information including table name, column info, etc.
    """
    try:
        with connection.cursor() as cursor:
            # Get table column information and comments
            query = """
                SELECT 
                    COLUMN_NAME as column_name,
                    DATA_TYPE as data_type,
                    COLUMN_TYPE as column_type,
                    IS_NULLABLE as is_nullable,
                    COLUMN_KEY as column_key,
                    COLUMN_DEFAULT as column_default,
                    COLUMN_COMMENT as column_comment
                FROM 
                    INFORMATION_SCHEMA.COLUMNS
                WHERE 
                    TABLE_SCHEMA = %s 
                    AND TABLE_NAME = %s
                ORDER BY 
                    ORDINAL_POSITION
            """
            cursor.execute(query, (database, table))
            columns = cursor.fetchall()
            
            # Get table comment
            table_comment_query = """
                SELECT 
                    TABLE_COMMENT as table_comment
                FROM 
                    INFORMATION_SCHEMA.TABLES
                WHERE 
                    TABLE_SCHEMA = %s 
                    AND TABLE_NAME = %s
            """
            cursor.execute(table_comment_query, (database, table))
            table_info = cursor.fetchone()
            table_comment = table_info.get('table_comment', '') if table_info else ''
            
            # Format column information
            column_list = []
            for col in columns:
                column_list.append({
                    'column_name': col['column_name'],
                    'column_type': col['column_type'],
                    'is_nullable': col['is_nullable'],
                    'column_key': col['column_key'],
                    'column_comment': col['column_comment'] or ''
                })
            
            return {
                'database': database,
                'table': table,
                'table_comment': table_comment,
                'columns': column_list,
                'column_count': len(column_list)
            }
            
    except Exception as e:
        logger.error(f"Failed to get table column info for {database}.{table}: {e}")
        return None


def get_tables_info(mysql_config: Dict[str, Any], tables: List[Dict[str, str]]) -> List[Dict[str, Any]]:
    """
    Batch retrieve column information for multiple tables
    
    Args:
        mysql_config: MySQL configuration dictionary containing host, port, user, password, etc.
        tables: List of tables, each element is {"database": "db_name", "table": "table_name"}
        
    Returns:
        List containing information for all tables
    """
    if not tables:
        return []
    
    connection = None
    all_tables_info = []
    
    try:
        connection = get_mysql_connection(
            host=mysql_config.get('host'),
            port=mysql_config.get('port'),
            user=mysql_config.get('user'),
            password=mysql_config.get('password'),
            database=mysql_config.get('database')
        )
        
        if not connection:
            logger.error("Failed to create MySQL connection")
            return []
        
        for table_info in tables:
            database = table_info.get('database')
            table = table_info.get('table')
            
            if not database or not table:
                logger.warning(f"Invalid table info: {table_info}")
                continue
            
            table_data = get_table_column_info(connection, database, table)
            if table_data:
                all_tables_info.append(table_data)
        
        return all_tables_info
        
    except Exception as e:
        logger.error(f"Error getting tables info: {e}")
        return []
    finally:
        if connection:
            connection.close()


def format_tables_info_as_text(tables_info: List[Dict[str, Any]]) -> str:
    """
    Format table information as text, suitable for passing as context to LLM
    
    Args:
        tables_info: List of table information
        
    Returns:
        Formatted text string
    """
    if not tables_info:
        return ""
    
    result = []
    result.append("## Database Table Information\n")
    
    for table_info in tables_info:
        database = table_info.get('database', '')
        table = table_info.get('table', '')
        table_comment = table_info.get('table_comment', '')
        columns = table_info.get('columns', [])
        
        result.append(f"### Table: {database}.{table}")
        if table_comment:
            result.append(f"Table Description: {table_comment}")
        result.append(f"Column Count: {len(columns)}\n")
        
        result.append("| Column Name | Column Type | Nullable | Key | Description |")
        result.append("|-------------|-----------|----------|-----|---------|-------------|")
        
        for col in columns:
            column_name = col.get('column_name', '')
            column_type = col.get('column_type', '')
            is_nullable = col.get('is_nullable', '')
            column_key = col.get('column_key', '')
            column_comment = col.get('column_comment', '')
            
            result.append(f"| {column_name} | {column_type} | {is_nullable} | {column_key} | | {column_comment} |")
        
        result.append("")  # Empty line to separate different tables
    
    return "\n".join(result)

