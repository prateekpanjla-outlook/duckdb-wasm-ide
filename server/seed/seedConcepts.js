/**
 * SQL Concept Taxonomy — seed data
 * ~30 concepts covering a standard SQL curriculum.
 * Used by the Question Authoring Agent to identify coverage gaps.
 */

export const seedConcepts = [
    // Basics
    { name: 'SELECT', category: 'basics', difficulty: 'beginner' },
    { name: 'SELECT *', category: 'basics', difficulty: 'beginner' },
    { name: 'WHERE', category: 'filtering', difficulty: 'beginner' },
    { name: 'AND/OR', category: 'filtering', difficulty: 'beginner' },
    { name: 'ORDER BY', category: 'sorting', difficulty: 'beginner' },
    { name: 'LIMIT', category: 'filtering', difficulty: 'beginner' },
    { name: 'DISTINCT', category: 'filtering', difficulty: 'beginner' },
    { name: 'LIKE', category: 'filtering', difficulty: 'beginner' },
    { name: 'IN', category: 'filtering', difficulty: 'beginner' },
    { name: 'BETWEEN', category: 'filtering', difficulty: 'beginner' },
    { name: 'IS NULL', category: 'null handling', difficulty: 'beginner' },
    { name: 'ALIAS', category: 'basics', difficulty: 'beginner' },

    // Aggregation
    { name: 'COUNT', category: 'aggregation', difficulty: 'beginner' },
    { name: 'SUM', category: 'aggregation', difficulty: 'beginner' },
    { name: 'AVG', category: 'aggregation', difficulty: 'beginner' },
    { name: 'MIN/MAX', category: 'aggregation', difficulty: 'beginner' },
    { name: 'GROUP BY', category: 'aggregation', difficulty: 'intermediate' },
    { name: 'HAVING', category: 'aggregation', difficulty: 'intermediate' },

    // Joins
    { name: 'INNER JOIN', category: 'joins', difficulty: 'intermediate' },
    { name: 'LEFT JOIN', category: 'joins', difficulty: 'intermediate' },
    { name: 'RIGHT JOIN', category: 'joins', difficulty: 'intermediate' },
    { name: 'FULL JOIN', category: 'joins', difficulty: 'advanced' },
    { name: 'SELF JOIN', category: 'joins', difficulty: 'advanced' },
    { name: 'CROSS JOIN', category: 'joins', difficulty: 'intermediate' },

    // Subqueries
    { name: 'Subquery in WHERE', category: 'subqueries', difficulty: 'advanced' },
    { name: 'Subquery in FROM', category: 'subqueries', difficulty: 'advanced' },
    { name: 'Correlated subquery', category: 'subqueries', difficulty: 'advanced' },
    { name: 'EXISTS', category: 'subqueries', difficulty: 'advanced' },

    // Window functions
    { name: 'ROW_NUMBER', category: 'window functions', difficulty: 'advanced' },
    { name: 'RANK', category: 'window functions', difficulty: 'advanced' },
    { name: 'DENSE_RANK', category: 'window functions', difficulty: 'advanced' },
    { name: 'LAG/LEAD', category: 'window functions', difficulty: 'advanced' },
    { name: 'PARTITION BY', category: 'window functions', difficulty: 'advanced' },

    // Advanced
    { name: 'CTE', category: 'advanced', difficulty: 'advanced' },
    { name: 'UNION', category: 'set operations', difficulty: 'intermediate' },
    { name: 'CASE WHEN', category: 'conditional', difficulty: 'intermediate' },
    { name: 'COALESCE', category: 'null handling', difficulty: 'intermediate' },
    { name: 'CAST', category: 'type conversion', difficulty: 'beginner' },
];

/**
 * Concept tagging for existing 7 questions.
 * Each entry maps a question_id to a concept name and whether it's the intended approach.
 *
 * Q1: SELECT * FROM employees WHERE department = 'Engineering'
 * Q2: SELECT * FROM products WHERE price > 100
 * Q3: SELECT AVG(score) as average_score FROM students
 * Q4: SELECT customer_id, SUM(total_amount) ... GROUP BY customer_id
 * Q5: SELECT ... WHERE salary > (SELECT AVG(salary) ... WHERE department = e.department)
 * Q6: SELECT * FROM books WHERE published_year > 1950 ORDER BY price DESC
 * Q7: SELECT product, region, SUM(amount) ... GROUP BY product, region ORDER BY ...
 */
export const seedQuestionConcepts = [
    // Q1: SELECT + WHERE (beginner)
    { question_id: 1, concept: 'SELECT *', is_intended: true },
    { question_id: 1, concept: 'WHERE', is_intended: true },

    // Q2: WHERE with comparison (beginner)
    { question_id: 2, concept: 'SELECT *', is_intended: true },
    { question_id: 2, concept: 'WHERE', is_intended: true },

    // Q3: AVG aggregate (beginner)
    { question_id: 3, concept: 'AVG', is_intended: true },
    { question_id: 3, concept: 'ALIAS', is_intended: true },

    // Q4: GROUP BY + SUM (intermediate)
    { question_id: 4, concept: 'GROUP BY', is_intended: true },
    { question_id: 4, concept: 'SUM', is_intended: true },
    { question_id: 4, concept: 'ALIAS', is_intended: true },
    { question_id: 4, concept: 'HAVING', is_intended: false },  // could add HAVING filter

    // Q5: Correlated subquery (advanced)
    { question_id: 5, concept: 'Correlated subquery', is_intended: true },
    { question_id: 5, concept: 'Subquery in WHERE', is_intended: true },
    { question_id: 5, concept: 'WHERE', is_intended: true },
    { question_id: 5, concept: 'AVG', is_intended: true },
    { question_id: 5, concept: 'CTE', is_intended: false },        // could use CTE + JOIN instead
    { question_id: 5, concept: 'INNER JOIN', is_intended: false },  // could join with avg subquery

    // Q6: ORDER BY + WHERE (beginner)
    { question_id: 6, concept: 'SELECT *', is_intended: true },
    { question_id: 6, concept: 'WHERE', is_intended: true },
    { question_id: 6, concept: 'ORDER BY', is_intended: true },

    // Q7: GROUP BY multiple columns + SUM + ORDER BY (intermediate)
    { question_id: 7, concept: 'GROUP BY', is_intended: true },
    { question_id: 7, concept: 'SUM', is_intended: true },
    { question_id: 7, concept: 'ORDER BY', is_intended: true },
    { question_id: 7, concept: 'ALIAS', is_intended: true },
];
