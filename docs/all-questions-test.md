# All Questions E2E Test Results

**Date**: 2026-02-10T16:13:56.143Z
**Status**: FAILED

## Test Coverage

- **Questions Tested**: 7/7 (100%)
- **Total Steps**: 36 (5 per question + initial setup)
- **Issues Found**: 1

## Questions Tested


### Question 1: Select all employees from the Engineering department
- **Category**: SELECT queries
- **Incorrect Query**: SELECT * FROM employees WHERE department = 'Sales'
- **Correct Query**: SELECT * FROM employees WHERE department = 'Engineering'
- **Status**: ✅ PASSED


### Question 2: Find all products that cost more than $100
- **Category**: WHERE clause
- **Incorrect Query**: SELECT * FROM products WHERE price < 100
- **Correct Query**: SELECT * FROM products WHERE price > 100
- **Status**: ✅ PASSED


### Question 3: Find the average score of all students
- **Category**: Aggregate functions
- **Incorrect Query**: SELECT COUNT(*) as average_score FROM students
- **Correct Query**: SELECT AVG(score) as average_score FROM students
- **Status**: ✅ PASSED


### Question 4: Find the total amount spent by each customer
- **Category**: GROUP BY
- **Incorrect Query**: SELECT customer_id, total_amount FROM orders
- **Correct Query**: SELECT customer_id, SUM(total_amount) as total_spent FROM orders GROUP BY customer_id
- **Status**: ✅ PASSED


### Question 5: Find all employees who earn more than their department average salary
- **Category**: Subqueries
- **Incorrect Query**: SELECT * FROM employees WHERE salary > 50000
- **Correct Query**: SELECT e.name, e.department, e.salary FROM employees e WHERE e.salary > (SELECT AVG(salary) FROM employees WHERE department = e.department)
- **Status**: ❌ FAILED


### Question 6: Find books published after 1950, ordered by price (most expensive first)
- **Category**: ORDER BY
- **Incorrect Query**: SELECT * FROM books WHERE published_year > 1950 ORDER BY price ASC
- **Correct Query**: SELECT * FROM books WHERE published_year > 1950 ORDER BY price DESC
- **Status**: ✅ PASSED


### Question 7: Find the total sales amount for each product in each region
- **Category**: GROUP BY (advanced)
- **Incorrect Query**: SELECT product, region, amount FROM sales
- **Correct Query**: SELECT product, region, SUM(amount) as total_sales FROM sales GROUP BY product, region ORDER BY product, region
- **Status**: ✅ PASSED


## Issues Found


### Issue #1: Question 5 Load

**Problem**: Question text does not match expected
**Expected**: Find all employees who earn more than their department average salary
**Actual**: Find the total amount spent by each customer
**Status**: 🔧 Needs Fix


---

## Screenshots

Total screenshots captured: 80

Per question (11 screenshots each):
1. Practice prompt (Q1 only)
2. Question loaded
3. Incorrect query typed
4. Incorrect query results
5. Before incorrect submit
6. After incorrect submit
7. Correct query typed
8. Correct query results
9. Before correct submit
10. After correct submit
11. Next Question button (or final state for Q7)

---

## Test Execution

To re-run this test:

```bash
# Ensure servers are running
cd server && node server.js &  # Backend on port 3000
python3 -m http.server 8000     # Frontend on port 8000

# Run test
node scripts/all-questions-test.js
```

---

## Summary

❌ **FAIL**: 1 issue(s) found across 7 questions.
