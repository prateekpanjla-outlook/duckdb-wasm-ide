import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'duckdb_ide',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres'
});

const questions = [
    {
        sql_data: `CREATE TABLE employees (
    id INTEGER,
    name VARCHAR,
    department VARCHAR,
    salary INTEGER,
    hire_date DATE
);

INSERT INTO employees VALUES
    (1, 'Alice', 'Engineering', 75000, '2020-01-15'),
    (2, 'Bob', 'Engineering', 80000, '2019-03-20'),
    (3, 'Charlie', 'Sales', 65000, '2021-06-10'),
    (4, 'Diana', 'Marketing', 70000, '2020-09-05'),
    (5, 'Eve', 'Engineering', 90000, '2018-11-30');`,
        sql_question: 'Select all employees from the Engineering department',
        sql_solution: 'SELECT * FROM employees WHERE department = \'Engineering\'',
        sql_solution_explanation: [
            'SELECT * - Selects all columns from the table',
            'FROM employees - Specifies the table name',
            'WHERE department = \'Engineering\' - Filters to only Engineering department'
        ],
        difficulty: 'beginner',
        category: 'SELECT queries',
        order_index: 1
    },
    {
        sql_data: `CREATE TABLE products (
    id INTEGER,
    name VARCHAR,
    category VARCHAR,
    price DECIMAL(10,2),
    stock_quantity INTEGER
);

INSERT INTO products VALUES
    (1, 'Laptop', 'Electronics', 999.99, 50),
    (2, 'Mouse', 'Electronics', 29.99, 200),
    (3, 'Desk', 'Furniture', 299.99, 30),
    (4, 'Chair', 'Furniture', 149.99, 75),
    (5, 'Monitor', 'Electronics', 399.99, 45);`,
        sql_question: 'Find all products that cost more than $100',
        sql_solution: 'SELECT * FROM products WHERE price > 100',
        sql_solution_explanation: [
            'SELECT * - Selects all columns',
            'FROM products - From the products table',
            'WHERE price > 100 - Filter for products costing more than $100'
        ],
        difficulty: 'beginner',
        category: 'WHERE clause',
        order_index: 2
    },
    {
        sql_data: `CREATE TABLE students (
    id INTEGER,
    name VARCHAR,
    grade VARCHAR,
    score INTEGER
);

INSERT INTO students VALUES
    (1, 'Alice', 'A', 95),
    (2, 'Bob', 'B', 85),
    (3, 'Charlie', 'A', 92),
    (4, 'Diana', 'C', 75),
    (5, 'Eve', 'A', 98);`,
        sql_question: 'Find the average score of all students',
        sql_solution: 'SELECT AVG(score) as average_score FROM students',
        sql_solution_explanation: [
            'SELECT AVG(score) - Calculate the average of the score column',
            'as average_score - Give the result column a readable name',
            'FROM students - From the students table'
        ],
        difficulty: 'beginner',
        category: 'Aggregate functions',
        order_index: 3
    },
    {
        sql_data: `CREATE TABLE orders (
    id INTEGER,
    customer_id INTEGER,
    order_date DATE,
    total_amount DECIMAL(10,2)
);

INSERT INTO orders VALUES
    (1, 101, '2024-01-15', 150.00),
    (2, 102, '2024-01-16', 200.50),
    (3, 101, '2024-01-17', 75.25),
    (4, 103, '2024-01-18', 300.00),
    (5, 102, '2024-01-19', 125.75);`,
        sql_question: 'Find the total amount spent by each customer',
        sql_solution: 'SELECT customer_id, SUM(total_amount) as total_spent FROM orders GROUP BY customer_id',
        sql_solution_explanation: [
            'SELECT customer_id - Include customer_id in results',
            'SUM(total_amount) - Calculate the sum of order amounts',
            'as total_spent - Name the result column',
            'FROM orders - From the orders table',
            'GROUP BY customer_id - Group results by customer'
        ],
        difficulty: 'intermediate',
        category: 'GROUP BY',
        order_index: 4
    },
    {
        sql_data: `CREATE TABLE employees (
    id INTEGER,
    name VARCHAR,
    department VARCHAR,
    salary INTEGER,
    manager_id INTEGER
);

INSERT INTO employees VALUES
    (1, 'Alice', 'Engineering', 90000, NULL),
    (2, 'Bob', 'Engineering', 75000, 1),
    (3, 'Charlie', 'Sales', 85000, NULL),
    (4, 'Diana', 'Sales', 70000, 3),
    (5, 'Eve', 'Engineering', 80000, 1);`,
        sql_question: 'Find all employees who earn more than their department average salary',
        sql_solution: `SELECT e.name, e.department, e.salary
FROM employees e
WHERE e.salary > (
    SELECT AVG(salary)
    FROM employees
    WHERE department = e.department
)`,
        sql_solution_explanation: [
            'SELECT e.name, e.department, e.salary - Select employee info',
            'FROM employees e - From employees table with alias e',
            'WHERE e.salary > - Filter for higher than average',
            '(SELECT AVG(salary) FROM employees WHERE department = e.department) - Subquery calculates average salary for the same department'
        ],
        difficulty: 'advanced',
        category: 'Subqueries',
        order_index: 5
    },
    {
        sql_data: `CREATE TABLE books (
    id INTEGER,
    title VARCHAR,
    author VARCHAR,
    published_year INTEGER,
    price DECIMAL(10,2)
);

INSERT INTO books VALUES
    (1, 'The Great Gatsby', 'F. Scott Fitzgerald', 1925, 12.99),
    (2, 'To Kill a Mockingbird', 'Harper Lee', 1960, 14.99),
    (3, '1984', 'George Orwell', 1949, 13.99),
    (4, 'Pride and Prejudice', 'Jane Austen', 1813, 11.99),
    (5, 'The Catcher in the Rye', 'J.D. Salinger', 1951, 10.99);`,
        sql_question: 'Find books published after 1950, ordered by price (most expensive first)',
        sql_solution: `SELECT * FROM books
WHERE published_year > 1950
ORDER BY price DESC`,
        sql_solution_explanation: [
            'SELECT * - Select all columns',
            'FROM books - From the books table',
            'WHERE published_year > 1950 - Filter for books after 1950',
            'ORDER BY price DESC - Sort by price in descending order'
        ],
        difficulty: 'beginner',
        category: 'ORDER BY',
        order_index: 6
    },
    {
        sql_data: `CREATE TABLE sales (
    id INTEGER,
    product VARCHAR,
    region VARCHAR,
    amount DECIMAL(10,2),
    sale_date DATE
);

INSERT INTO sales VALUES
    (1, 'Widget', 'North', 5000.00, '2024-01-01'),
    (2, 'Gadget', 'South', 3000.00, '2024-01-02'),
    (3, 'Widget', 'East', 4500.00, '2024-01-03'),
    (4, 'Doohickey', 'North', 2000.00, '2024-01-04'),
    (5, 'Widget', 'West', 5500.00, '2024-01-05');`,
        sql_question: 'Find the total sales amount for each product in each region',
        sql_solution: `SELECT product, region, SUM(amount) as total_sales
FROM sales
GROUP BY product, region
ORDER BY product, region`,
        sql_solution_explanation: [
            'SELECT product, region - Include both grouping columns',
            'SUM(amount) - Sum the sales amounts',
            'as total_sales - Name the result',
            'FROM sales - From the sales table',
            'GROUP BY product, region - Group by both product and region',
            'ORDER BY product, region - Sort for readability'
        ],
        difficulty: 'intermediate',
        category: 'GROUP BY',
        order_index: 7
    }
];

async function seedQuestions() {
    try {
        console.log('🌱 Starting to seed questions...\n');

        for (const q of questions) {
            const result = await pool.query(
                `INSERT INTO questions (
                    sql_data, sql_question, sql_solution,
                    sql_solution_explanation, difficulty, category, order_index
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT DO NOTHING
                RETURNING id`,
                [
                    q.sql_data,
                    q.sql_question,
                    q.sql_solution,
                    JSON.stringify(q.sql_solution_explanation),
                    q.difficulty,
                    q.category,
                    q.order_index
                ]
            );

            if (result.rows.length > 0) {
                console.log(`✅ Added question ${result.rows[0].id}: ${q.sql_question.substring(0, 50)}...`);
            } else {
                console.log(`⚠️  Question already exists: ${q.sql_question.substring(0, 50)}...`);
            }
        }

        console.log('\n✨ Seeding completed!');
        console.log(`\n📊 Total questions in database:`);

        const countResult = await pool.query('SELECT COUNT(*) as count FROM questions');
        console.log(`   ${countResult.rows[0].count} questions available`);

        await pool.end();
        process.exit(0);

    } catch (error) {
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    }
}

seedQuestions();
