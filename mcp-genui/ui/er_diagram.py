"""Parse CREATE TABLE SQL and generate Mermaid ER diagrams."""

import re


def generate_er_diagram(sql_data: str) -> str | None:
    """Parse SQL schema and generate a Mermaid ER diagram.

    Returns a Mermaid erDiagram string if multiple tables with foreign keys exist.
    Returns None for single-table schemas or schemas without FK relationships.
    """
    create_pattern = r"CREATE\s+(?:OR\s+REPLACE\s+)?TABLE\s+(\w+)\s*\(([\s\S]+?)\);"
    matches = list(re.finditer(create_pattern, sql_data, re.IGNORECASE))

    if len(matches) < 2:
        return None

    tables = {}
    relationships = []

    for match in matches:
        table_name = match.group(1).lower()
        columns_str = match.group(2)
        columns = []

        for col_line in columns_str.split(","):
            col_line = col_line.strip()
            if not col_line:
                continue

            if re.match(r"^\s*(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)\s", col_line, re.IGNORECASE):
                fk_match = re.search(r"FOREIGN\s+KEY\s*\((\w+)\)\s*REFERENCES\s+(\w+)", col_line, re.IGNORECASE)
                if fk_match:
                    fk_col = fk_match.group(1).lower()
                    fk_table = fk_match.group(2).lower()
                    relationships.append((fk_table, table_name, fk_col))
                    for i, (cn, ct, pk, ft) in enumerate(columns):
                        if cn == fk_col:
                            columns[i] = (cn, ct, pk, fk_table)
                continue

            parts = col_line.split()
            if len(parts) < 2:
                continue

            col_name = parts[0].lower()
            col_type = parts[1].upper()
            col_type = re.sub(r"\(.*?\)", "", col_type)

            is_pk = bool(re.search(r"PRIMARY\s+KEY", col_line, re.IGNORECASE))

            fk_table = None
            ref_match = re.search(r"REFERENCES\s+(\w+)", col_line, re.IGNORECASE)
            if ref_match:
                fk_table = ref_match.group(1).lower()
                relationships.append((fk_table, table_name, col_name))

            columns.append((col_name, col_type, is_pk, fk_table))

        tables[table_name] = columns

    if not relationships:
        return None

    lines = ["erDiagram"]

    seen_rels = set()
    for parent, child, col in relationships:
        rel_key = f"{parent}-{child}"
        if rel_key not in seen_rels:
            seen_rels.add(rel_key)
            lines.append(f"    {parent} ||--o{{ {child} : has")

    for table_name, columns in tables.items():
        lines.append(f"    {table_name} {{")
        for col_name, col_type, is_pk, fk_table in columns:
            suffix = " PK" if is_pk else (" FK" if fk_table else "")
            lines.append(f"        {col_type} {col_name}{suffix}")
        lines.append("    }")

    return "\n".join(lines)
