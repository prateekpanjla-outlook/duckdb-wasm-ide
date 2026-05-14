"""FastMCP server with Generative UI — LLM writes Prefab Python code at runtime.

Same 8 tools as v1/v2 PLUS:
  - generate_prefab_ui: LLM writes Python Prefab code, Pyodide renders live
  - search_prefab_components: LLM discovers available Prefab components

Run: PYTHONIOENCODING=utf-8 fastmcp dev apps mcp_server.py --no-reload
"""

import json as _json

from fastmcp import FastMCP
from fastmcp.tools.base import ToolResult
from mcp.types import TextContent
from prefab_ui.components import *
from tools.api_client import ApiClient
from ui.components import (
    build_coverage_table,
    build_questions_table,
    build_validation_result,
    build_concept_overlap,
    build_concepts_table,
    build_sql_result,
    build_question_preview,
    build_insert_result,
    build_test_code,
    build_dashboard,
)

mcp = FastMCP("SQL Practice Agent — Generative UI")

api = ApiClient()


# Pass-through generative UI tools — browser Pyodide does the real rendering
@mcp.tool()
def generate_prefab_ui(code: str, data: dict | str | None = None) -> str:
    """Execute Prefab Python code to render a UI component.

    Write Python code using prefab_ui components (Column, Row, Card, Badge,
    Code, Mermaid, Heading, Text, BarChart, DataTable, Tabs, Tab, Metric,
    Table, Input, Select, Form, P, H4, CardContent, CardHeader).

    Always use PrefabApp as the outermost context manager.
    Values passed via `data` are available as global variables in the code.

    Args:
        code: Python source using prefab_ui components inside PrefabApp().
        data: Optional dict of values accessible as variables in the code.
    """
    # No server-side execution — code is sent to browser Pyodide via SSE
    return "[Rendered Prefab UI]"


@mcp.tool()
def search_prefab_components(query: str = "") -> str:
    """Search the Prefab component library for available components.

    Args:
        query: Filter by component name or description. Space-separated terms are OR-matched.
    """
    from prefab_ui.generative import search_components
    return search_components(query)


def _dual(data: dict, column: Column) -> ToolResult:
    """Return JSON text for LLM + Prefab structured content for browser."""
    return ToolResult(
        content=[TextContent(type="text", text=_json.dumps(data, default=str))],
        structured_content=column,
    )


@mcp.tool(app=True)
async def get_coverage_gaps() -> ToolResult:
    """Get SQL concepts with ZERO intended questions — gaps in the curriculum."""
    data = await api.get_coverage_gaps()
    return _dual(data, build_coverage_table(data))


@mcp.tool(app=True)
async def list_existing_questions() -> ToolResult:
    """List all existing practice questions with topics, difficulty, and order indices."""
    data = await api.list_existing_questions()
    return _dual(data, build_questions_table(data))


@mcp.tool(app=True)
async def list_concepts() -> ToolResult:
    """List all SQL concepts in the taxonomy with coverage counts."""
    data = await api.list_concepts()
    return _dual(data, build_concepts_table(data))


@mcp.tool(app=True)
async def validate_question(sql_data: str, sql_solution: str) -> ToolResult:
    """Validate a question: create tables, run solution, check distinguishability."""
    data = await api.validate_question(sql_data, sql_solution)
    return _dual(data, build_validation_result(data, sql_data=sql_data))


@mcp.tool(app=True)
async def execute_sql(sql: str) -> ToolResult:
    """Execute a SQL query to test if it runs correctly."""
    data = await api.execute_sql(sql)
    return _dual(data, build_sql_result(data, sql=sql))


@mcp.tool(app=True)
async def check_concept_overlap(concepts: list[str]) -> ToolResult:
    """Check if concepts already have questions covering them."""
    data = await api.check_concept_overlap(concepts)
    return _dual(data, build_concept_overlap(data))


@mcp.tool(app=True)
async def insert_question(
    sql_data: str,
    sql_question: str,
    sql_solution: str,
    sql_solution_explanation: list[str],
    difficulty: str,
    category: str,
    order_index: int,
    er_diagram: str = "",
) -> ToolResult:
    """Insert a validated and approved question into the database."""
    data = await api.insert_question({
        "sql_data": sql_data,
        "sql_question": sql_question,
        "sql_solution": sql_solution,
        "sql_solution_explanation": sql_solution_explanation,
        "difficulty": difficulty,
        "category": category,
        "order_index": order_index,
        "er_diagram": er_diagram or None,
    })
    return _dual(data, build_insert_result(data))


@mcp.tool(app=True)
async def generate_test(question_id: int, sql_solution: str, question_text: str) -> ToolResult:
    """Generate a Playwright E2E test for a question."""
    data = await api.generate_test(question_id, sql_solution, question_text)
    return _dual(data, build_test_code(data))


@mcp.tool(app=True)
async def render_dashboard(results_json: str) -> Column:
    """Render a combined dashboard of all agent tool results.

    Takes a JSON string: [{"tool": "name", "data": {...}}, ...]
    Returns a scrollable Prefab Column with all results stacked.
    """
    import json
    results = json.loads(results_json)
    return build_dashboard(results)


if __name__ == "__main__":
    mcp.run()
