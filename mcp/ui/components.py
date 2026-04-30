"""Prefab UI component builders — one per tool.

Each function takes tool result data and returns a Prefab Column.
Rules (from docs/mcp_prefab.md):
  - Return Column not Page
  - Use P not Paragraph, Code not CodeBlock
  - TableCell only accepts strings (not nested components)
  - Badge(label, variant="default"|"destructive"|"outline"|"secondary")
"""

from prefab_ui.components import *
from .er_diagram import generate_er_diagram


def build_coverage_table(data: dict) -> Column:
    """Coverage gaps — get_coverage_gaps result."""
    gaps = data.get("gaps_by_category", {})
    total = data.get("total_gaps", 0)
    all_gaps = [g for cat_gaps in gaps.values() for g in cat_gaps]

    # Count by difficulty
    beginner = sum(1 for g in all_gaps if g.get("difficulty") == "beginner")
    intermediate = sum(1 for g in all_gaps if g.get("difficulty") == "intermediate")
    advanced = sum(1 for g in all_gaps if g.get("difficulty") == "advanced")

    with Column(gap=3) as layout:
        H3(f"Coverage Gaps ({total} concepts)")

        with Card():
            with CardContent():
                with Row(gap=4):
                    Metric(label="Total Gaps", value=str(total))
                    Metric(label="Beginner", value=str(beginner))
                    Metric(label="Intermediate", value=str(intermediate))
                    Metric(label="Advanced", value=str(advanced))

        with Card():
            with CardContent():
                with Table():
                    with TableHeader():
                        with TableRow():
                            TableHead("Concept")
                            TableHead("Category")
                            TableHead("Difficulty")
                    with TableBody():
                        for gap in all_gaps[:20]:  # limit to 20 rows
                            with TableRow():
                                TableCell(gap.get("name", ""))
                                TableCell(gap.get("category", ""))
                                TableCell(gap.get("difficulty", ""))

    return layout


def build_questions_table(data: dict) -> Column:
    """Existing questions — list_existing_questions result."""
    questions = data.get("questions", [])
    count = data.get("count", 0)
    next_idx = data.get("next_order_index", "?")
    used_tables = data.get("used_table_names", [])

    with Column(gap=3) as layout:
        H3(f"Existing Questions ({count})")

        with Card():
            with CardContent():
                with Row(gap=4):
                    Metric(label="Total Questions", value=str(count))
                    Metric(label="Next Order Index", value=str(next_idx))

        with Card():
            with CardHeader():
                H4("Questions")
            with CardContent():
                with Table():
                    with TableHeader():
                        with TableRow():
                            TableHead("ID")
                            TableHead("Category")
                            TableHead("Difficulty")
                            TableHead("Preview")
                    with TableBody():
                        for q in questions:
                            with TableRow():
                                TableCell(str(q.get("id", "")))
                                TableCell(q.get("category", ""))
                                TableCell(q.get("difficulty", ""))
                                TableCell(q.get("question_preview", "")[:60])

        with Card():
            with CardHeader():
                H4("Used Table Names")
            with CardContent():
                with Row(gap=1):
                    for t in used_tables:
                        Badge(t, variant="outline")

    return layout


def build_validation_result(data: dict, sql_data: str = None) -> Column:
    """Validation checklist — validate_question result."""
    schema_valid = data.get("schema_valid", False)
    solution_valid = data.get("solution_valid", False)
    distinguishable = data.get("distinguishable", False)
    rows_inserted = data.get("rows_inserted", 0)
    solution_rows = data.get("solution_rows", 0)
    collisions = data.get("table_collisions")
    error = data.get("error")

    with Column(gap=3) as layout:
        H3("Validation Results")

        with Card():
            with CardContent():
                with Column(gap=2):
                    P(f"{'✓' if schema_valid else '✗'} Schema Valid — {rows_inserted} rows inserted")
                    P(f"{'✓' if solution_valid else '✗'} Solution Valid — returns {solution_rows} rows")
                    P(f"{'✓' if distinguishable else '✗'} Distinguishable from SELECT *")
                    if collisions:
                        for c in collisions:
                            P(f"⚠ Table collision: {', '.join(c.get('tables', []))} used in Q{c.get('question_id')}")
                    if error:
                        P(f"Error: {error}")

    return layout


def build_concept_overlap(data: dict) -> Column:
    """Concept overlap status — check_concept_overlap result."""
    concepts = data.get("concepts", [])

    with Column(gap=3) as layout:
        H3("Concept Overlap Check")

        with Card():
            with CardContent():
                with Column(gap=2):
                    for c in concepts:
                        name = c.get("concept", "")
                        status = c.get("status", "unknown")
                        if status == "not_covered":
                            P(f"● {name} — not covered yet (good to add)")
                        elif status == "already_covered":
                            ids = [str(q["id"]) for q in c.get("intended_in", [])]
                            P(f"● {name} — already covered in Q{', Q'.join(ids)}")
                        elif status == "alternative_only":
                            ids = [str(q["id"]) for q in c.get("alternative_in", [])]
                            P(f"● {name} — alternative solution in Q{', Q'.join(ids)}")
                        elif status == "not_in_taxonomy":
                            P(f"● {name} — not in taxonomy")
                        else:
                            P(f"● {name} — {status}")

    return layout


def build_concepts_table(data: dict) -> Column:
    """Full taxonomy — list_concepts result."""
    concepts = data.get("concepts", [])
    total = data.get("total_concepts", 0)

    with Column(gap=3) as layout:
        H3(f"SQL Concept Taxonomy ({total} concepts)")

        with Card():
            with CardContent():
                with Table():
                    with TableHeader():
                        with TableRow():
                            TableHead("Concept")
                            TableHead("Category")
                            TableHead("Difficulty")
                            TableHead("Intended")
                            TableHead("Alternative")
                    with TableBody():
                        for c in concepts:
                            with TableRow():
                                TableCell(c.get("name", ""))
                                TableCell(c.get("category", ""))
                                TableCell(c.get("difficulty", ""))
                                TableCell(str(c.get("intended_questions", 0)))
                                TableCell(str(c.get("alternative_questions", 0)))

    return layout


def build_sql_result(data: dict, sql: str = None) -> Column:
    """SQL execution result — execute_sql result."""
    success = data.get("success", False)
    error = data.get("error")
    rows = data.get("rows", [])
    columns = data.get("columns", [])
    command = data.get("command", "")
    row_count = data.get("rowCount", 0)

    with Column(gap=3) as layout:
        H3(f"SQL Execution — {command}")

        if sql:
            with Card():
                with CardContent():
                    Code(sql)

        if success:
            with Card():
                with CardContent():
                    P(f"Success: {row_count} row(s)")
                    if columns and rows:
                        with Table():
                            with TableHeader():
                                with TableRow():
                                    for col in columns:
                                        TableHead(col)
                            with TableBody():
                                for row in rows[:10]:  # limit to 10 rows
                                    with TableRow():
                                        for col in columns:
                                            TableCell(str(row.get(col, "")))
        else:
            with Card():
                with CardContent():
                    P(f"Error: {error or 'Unknown error'}")

    return layout


def build_question_preview(question: dict, sql_data: str = None) -> Column:
    """Full question preview — final agent output with approve/reject."""
    difficulty = question.get("difficulty", "")
    category = question.get("category", "")
    sql_question = question.get("sql_question", "")
    sql_solution = question.get("sql_solution", "")
    explanation = question.get("sql_solution_explanation", [])
    concepts = question.get("concepts", [])
    order_index = question.get("order_index", "?")
    data = sql_data or question.get("sql_data", "")

    with Column(gap=3) as layout:
        H3("Proposed Question")

        with Card():
            with CardHeader():
                with Row(gap=2):
                    Badge(difficulty, variant="default")
                    Badge(category, variant="outline")
                    Badge(f"Order #{order_index}", variant="secondary")

            with CardContent():
                with Column(gap=3):
                    H4("Question")
                    P(sql_question)

                    H4("Schema")
                    Code(data)

                    # ER diagram if multi-table with FK
                    er = generate_er_diagram(data)
                    if er:
                        H4("Table Relationships")
                        Mermaid(er)

                    H4("Solution")
                    Code(sql_solution)

                    if explanation:
                        H4("Explanation")
                        with Column(gap=1):
                            for i, step in enumerate(explanation, 1):
                                P(f"{i}. {step}")

                    H4("Concepts")
                    with Row(gap=1):
                        for c in concepts:
                            if isinstance(c, dict):
                                name = c.get("name", "")
                                intended = c.get("is_intended", True)
                                Badge(name, variant="default" if intended else "outline")
                            else:
                                Badge(str(c), variant="default")

            with CardFooter():
                with Row(gap=2):
                    Button("Approve & Insert", variant="default")
                    Button("Reject", variant="destructive")
                    Button("Retry", variant="outline")

    return layout


def build_insert_result(data: dict) -> Column:
    """Insert success — insert_question result."""
    qid = data.get("id", "?")
    message = data.get("message", "")
    concepts = data.get("concepts_tagged", [])

    with Column(gap=3) as layout:
        H3("Question Inserted")

        with Card():
            with CardContent():
                with Column(gap=2):
                    P(f"Question #{qid} inserted successfully")
                    if concepts:
                        with Row(gap=1):
                            for c in concepts:
                                Badge(c, variant="default")
                    Button("Generate Playwright Test", variant="outline")

    return layout


def build_test_code(data: dict) -> Column:
    """Generated test — generate_test result."""
    filename = data.get("filename", "")
    code = data.get("code", "")

    with Column(gap=3) as layout:
        H3("Generated Playwright Test")

        with Card():
            with CardHeader():
                Badge(filename, variant="outline")
            with CardContent():
                Code(code)

    return layout


def build_answer_preview(answer_text: str) -> Column:
    """Render the agent's final answer in a Prefab Card.

    If the answer is a JSON question object, renders it using
    build_question_preview for rich formatting with ER diagrams.
    Otherwise renders as plain text paragraphs.
    """
    import json

    # Try to parse as question JSON — strip markdown code fences if present
    text = answer_text.strip()
    if text.startswith("```"):
        # Remove ```json ... ``` wrapper
        text = text.split("\n", 1)[-1]  # remove first line (```json)
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
    elif text.startswith("json"):
        # Remove bare "json" prefix (no backticks)
        text = text[4:].strip()

    try:
        data = json.loads(text)
        if isinstance(data, dict) and "sql_data" in data and "sql_question" in data:
            return build_question_preview(data, sql_data=data.get("sql_data"))
    except (json.JSONDecodeError, TypeError):
        pass

    # Plain text fallback
    with Column(gap=3) as layout:
        H3("Agent Answer")

        with Card():
            with CardContent():
                for para in answer_text.split("\n\n"):
                    para = para.strip()
                    if not para:
                        continue
                    if para.startswith("```"):
                        Code(para.strip("`").strip())
                    else:
                        P(para)

    return layout


# ── Dashboard: combined view of all tool results ──

# Map tool names to their builder functions
TOOL_BUILDERS = {
    "get_coverage_gaps": build_coverage_table,
    "list_existing_questions": build_questions_table,
    "list_concepts": build_concepts_table,
    "validate_question": build_validation_result,
    "execute_sql": build_sql_result,
    "check_concept_overlap": build_concept_overlap,
    "insert_question": build_insert_result,
    "generate_test": build_test_code,
}


def build_dashboard(results: list[dict]) -> Column:
    """Build a combined scrollable Column with all tool results stacked.

    Each entry: {"tool": "tool_name", "data": {...tool result data...}}
    Special entry: {"tool": "_answer", "data": {"text": "..."}}
    """
    sections = []
    for entry in results:
        tool_name = entry.get("tool", "")
        data = entry.get("data", {})

        try:
            if tool_name == "_answer":
                sections.append(build_answer_preview(data.get("text", "")))
            elif tool_name in TOOL_BUILDERS:
                builder = TOOL_BUILDERS[tool_name]
                if tool_name == "validate_question":
                    sections.append(builder(data, sql_data=data.get("_sql_data")))
                elif tool_name == "execute_sql":
                    sections.append(builder(data, sql=data.get("_sql")))
                else:
                    sections.append(builder(data))
            else:
                sections.append(
                    Column(children=[
                        Card(children=[
                            CardContent(children=[
                                H4(content=tool_name),
                                P(content=str(data)[:300]),
                            ])
                        ])
                    ])
                )
        except Exception as e:
            sections.append(
                Column(children=[
                    Card(children=[
                        CardContent(children=[
                            P(content=f"Error rendering {tool_name}: {str(e)}"),
                        ])
                    ])
                ])
            )

    return Column(children=sections, gap=4)
