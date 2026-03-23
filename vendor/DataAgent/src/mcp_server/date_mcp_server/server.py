import calendar
import datetime
import json
import logging
from enum import Enum
from typing import Tuple

from mcp.server.fastmcp import FastMCP

# ==================== Configuration ====================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

mcp = FastMCP("Date", port=9095)


# ==================== Enum Definitions ====================

class DateUnit(str, Enum):
    """Date unit"""
    DAY = "day"
    WEEK = "week"
    MONTH = "month"
    QUARTER = "quarter"
    YEAR = "year"

# ==================== Utility Classes ====================

class DateRangeCalculator:
    """Date range calculator"""

    @staticmethod
    def get_day_range(year: int, month: int, day: int) -> Tuple[str, str]:
        """Get date range for a specific day"""
        start_date = datetime.date(year, month, day)
        end_date = start_date
        return start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d')

    @staticmethod
    def get_week_range(year: int, week: int) -> Tuple[str, str]:
        """Get date range for a specific week (ISO week)"""
        start_date = datetime.date.fromisocalendar(year, week, 1)
        end_date = datetime.date.fromisocalendar(year, week, 7)
        return start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d')

    @staticmethod
    def get_month_range(year: int, month: int) -> Tuple[str, str]:
        """Get date range for a specific month"""
        start_date = datetime.date(year, month, 1)
        last_day = calendar.monthrange(year, month)[1]
        end_date = datetime.date(year, month, last_day)
        return start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d')

    @staticmethod
    def get_quarter_range(year: int, quarter: int) -> Tuple[str, str]:
        """Get date range for a specific quarter"""
        if quarter not in [1, 2, 3, 4]:
            raise ValueError("Quarter must be a number between 1-4")

        start_month = (quarter - 1) * 3 + 1
        end_month = start_month + 2

        start_date = datetime.date(year, start_month, 1)
        last_day = calendar.monthrange(year, end_month)[1]
        end_date = datetime.date(year, end_month, last_day)

        return start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d')

    @staticmethod
    def get_year_range(year: int) -> Tuple[str, str]:
        """Get date range for a specific year"""
        start_date = datetime.date(year, 1, 1)
        end_date = datetime.date(year, 12, 31)
        return start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d')

    @staticmethod
    def get_date_range(start_date: str, days: int) -> Tuple[str, str]:
        """Calculate N days range from a specified date"""
        start = datetime.datetime.strptime(start_date, '%Y-%m-%d').date()
        end = start + datetime.timedelta(days=days - 1)
        return start.strftime('%Y-%m-%d'), end.strftime('%Y-%m-%d')

# ==================== MCP Tool Functions ====================

@mcp.tool()
async def get_date_range(
        unit: str,
        year: str,
        month: str = "",
        day: str = "",
        week: str = "",
        quarter: str = ""
) -> str:
    """
    Universal date range query tool (recommended)

    Args:
        unit (str): Time unit, required. Options: "day", "week", "month", "quarter", "year"
        year (str): Year, required. Format: "2025"
        month (str): Month, optional (required when unit is day/month). Format: "1" or "12", range: 1-12
        day (str): Day, optional (required when unit is day). Format: "1" or "31", range: 1-31
        week (str): Week number, optional (required when unit is week). Format: "1" or "52", range: 1-53
        quarter (str): Quarter, optional (required when unit is quarter). Format: "1", "2", "3" or "4", range: 1-4

    Returns:
        str: JSON string containing success, start_date, end_date, unit, description fields

    Examples:
        # Get range for January 15, 2025
        await get_date_range(unit="day", year="2025", month="1", day="15")
        Returns: {"success": true, "start_date": "2025-01-15", "end_date": "2025-01-15", ...}

        # Get range for week 10 of 2025
        await get_date_range(unit="week", year="2025", week="10")
        Returns: {"success": true, "start_date": "2025-03-03", "end_date": "2025-03-09", ...}

        # Get range for March 2025
        await get_date_range(unit="month", year="2025", month="3")
        Returns: {"success": true, "start_date": "2025-03-01", "end_date": "2025-03-31", ...}

        # Get range for Q2 2025
        await get_date_range(unit="quarter", year="2025", quarter="2")
        Returns: {"success": true, "start_date": "2025-04-01", "end_date": "2025-06-30", ...}

        # Get range for 2025
        await get_date_range(unit="year", year="2025")
        Returns: {"success": true, "start_date": "2025-01-01", "end_date": "2025-12-31", ...}
    """
    try:
        if not year:
            raise ValueError("year parameter is required")

        year_int = int(year)
        calculator = DateRangeCalculator()

        if unit == DateUnit.DAY.value:
            if not month or not day:
                raise ValueError("When unit is day, month and day parameters are required")
            start_date, end_date = calculator.get_day_range(year_int, int(month), int(day))

        elif unit == DateUnit.WEEK.value:
            if not week:
                raise ValueError("When unit is week, week parameter is required")
            start_date, end_date = calculator.get_week_range(year_int, int(week))

        elif unit == DateUnit.MONTH.value:
            if not month:
                raise ValueError("When unit is month, month parameter is required")
            start_date, end_date = calculator.get_month_range(year_int, int(month))

        elif unit == DateUnit.QUARTER.value:
            if not quarter:
                raise ValueError("When unit is quarter, quarter parameter is required")
            start_date, end_date = calculator.get_quarter_range(year_int, int(quarter))

        elif unit == DateUnit.YEAR.value:
            start_date, end_date = calculator.get_year_range(year_int)

        else:
            raise ValueError(f"Unsupported time unit: {unit}, options: day, week, month, quarter, year")

        return json.dumps({
            "success": True,
            "start_date": start_date,
            "end_date": end_date,
            "unit": unit,
            "description": f"Year {year}" + (f" Month {month}" if month else "") + (f" Day {day}" if day else "") +
                           (f" Week {week}" if week else "") + (f" Q{quarter}" if quarter else "")
        }, ensure_ascii=False)

    except Exception as e:
        logger.error(f"Failed to get date range: {e}")
        return json.dumps({
            "success": False,
            "message": f"Failed to get date range: {str(e)}"
        }, ensure_ascii=False)


@mcp.tool()
async def calculate_date_offset(start_date: str, offset: int, unit: str = "day") -> str:
    """
    Calculate date offset

    From a specified date, offset forward or backward by a specified time unit.

    Args:
        start_date (str): Start date, required. Format: "YYYY-MM-DD" (e.g. "2025-01-01")
        offset (int): Offset amount, required. Positive for forward, negative for backward (e.g. 30, -7)
        unit (str): Time unit, optional (default is "day"). Options: "day", "week", "month", "year"

    Returns:
        str: JSON string containing success, start_date, result_date, offset, unit fields

    Examples:
        # Get date 30 days later
        await calculate_date_offset(start_date="2025-01-01", offset=30, unit="day")
        Returns: {"success": true, "result_date": "2025-01-31", ...}

        # Get date 3 months earlier
        await calculate_date_offset(start_date="2025-01-01", offset=-3, unit="month")
        Returns: {"success": true, "result_date": "2024-10-01", ...}

        # Get date 2 weeks later
        await calculate_date_offset(start_date="2025-01-15", offset=2, unit="week")
        Returns: {"success": true, "result_date": "2025-01-29", ...}
    """
    try:
        base_date = datetime.datetime.strptime(start_date, '%Y-%m-%d').date()

        if unit == "day":
            result_date = base_date + datetime.timedelta(days=offset)
        elif unit == "week":
            result_date = base_date + datetime.timedelta(weeks=offset)
        elif unit == "month":
            # Month offset requires special handling
            month = base_date.month + offset
            year = base_date.year
            while month > 12:
                month -= 12
                year += 1
            while month < 1:
                month += 12
                year -= 1
            # Handle day overflow (e.g. Jan 31 + 1 month)
            last_day = calendar.monthrange(year, month)[1]
            day = min(base_date.day, last_day)
            result_date = datetime.date(year, month, day)
        elif unit == "year":
            result_date = base_date.replace(year=base_date.year + offset)
        else:
            raise ValueError(f"Unsupported time unit: {unit}")

        return json.dumps({
            "success": True,
            "start_date": start_date,
            "result_date": result_date.strftime('%Y-%m-%d'),
            "offset": offset,
            "unit": unit
        }, ensure_ascii=False)

    except Exception as e:
        logger.error(f"Failed to calculate date offset: {e}")
        return json.dumps({
            "success": False,
            "message": f"Failed to calculate date offset: {str(e)}"
        }, ensure_ascii=False)

if __name__ == "__main__":
    logger.info("Starting Date Processing MCP Service (Port: 9095)...")
    mcp.run(transport="sse")