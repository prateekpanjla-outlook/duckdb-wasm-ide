"""FastMCP server — 8 tools with Prefab UI for the Question Authoring Agent.

Each tool calls the Express API for real data and returns a Prefab Column.
Run: PYTHONIOENCODING=utf-8 fastmcp dev apps mcp_server.py --no-reload
"""

from fastmcp import FastMCP
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

mcp = FastMCP("SQL Practice Agent")
api = ApiClient()


@mcp.tool(app=True)
async def get_coverage_gaps() -> Column:
    """Get SQL concepts with ZERO intended questions — gaps in the curriculum."""
    data = await api.get_coverage_gaps()
    return build_coverage_table(data)


@mcp.tool(app=True)
async def list_existing_questions() -> Column:
    """List all existing practice questions with topics, difficulty, and order indices."""
    data = await api.list_existing_questions()
    return build_questions_table(data)


@mcp.tool(app=True)
async def list_concepts() -> Column:
    """List all SQL concepts in the taxonomy with coverage counts."""
    data = await api.list_concepts()
    return build_concepts_table(data)


@mcp.tool(app=True)
async def validate_question(sql_data: str, sql_solution: str) -> Column:
    """Validate a question: create tables, run solution, check distinguishability."""
    data = await api.validate_question(sql_data, sql_solution)
    return build_validation_result(data, sql_data=sql_data)


@mcp.tool(app=True)
async def execute_sql(sql: str) -> Column:
    """Execute a SQL query to test if it runs correctly."""
    data = await api.execute_sql(sql)
    return build_sql_result(data, sql=sql)


@mcp.tool(app=True)
async def check_concept_overlap(concepts: list[str]) -> Column:
    """Check if concepts already have questions covering them."""
    data = await api.check_concept_overlap(concepts)
    return build_concept_overlap(data)


@mcp.tool(app=True)
async def insert_question(
    sql_data: str,
    sql_question: str,
    sql_solution: str,
    sql_solution_explanation: list[str],
    difficulty: str,
    category: str,
    order_index: int,
) -> Column:
    """Insert a validated and approved question into the database."""
    data = await api.insert_question({
        "sql_data": sql_data,
        "sql_question": sql_question,
        "sql_solution": sql_solution,
        "sql_solution_explanation": sql_solution_explanation,
        "difficulty": difficulty,
        "category": category,
        "order_index": order_index,
    })
    return build_insert_result(data)


@mcp.tool(app=True)
async def generate_test(question_id: int, sql_solution: str, question_text: str) -> Column:
    """Generate a Playwright E2E test for a question."""
    data = await api.generate_test(question_id, sql_solution, question_text)
    return build_test_code(data)


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
