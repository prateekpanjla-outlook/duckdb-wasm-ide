// POC: Cloud Run <-> Cloud SQL connectivity test
// Connects via Unix socket, creates table, inserts, reads back, drops
import pg from 'pg';
import http from 'http';

const { Pool } = pg;

const config = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'duckdb_ide',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    max: 5,
    connectionTimeoutMillis: 10000,
};

console.log('=== Cloud SQL Connectivity POC ===');
console.log('DB_HOST:', config.host);
console.log('DB_NAME:', config.database);
console.log('DB_USER:', config.user);
console.log('');

const pool = new Pool(config);

// HTTP server for Cloud Run health checks (must respond to keep container alive)
const server = http.createServer(async (req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
    } else if (req.url === '/health/db') {
        try {
            const result = await runDbTest();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
    } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('POC DB Test Service. Use /health or /health/db');
    }
});

async function runDbTest() {
    const results = {};

    // Step 1: Connect
    console.log('Step 1: Connecting to PostgreSQL...');
    const client = await pool.connect();
    results.connect = 'OK';
    console.log('  Connected!');

    // Step 2: Create table
    console.log('Step 2: Creating test table...');
    await client.query(`
        CREATE TABLE IF NOT EXISTS poc_test (
            id SERIAL PRIMARY KEY,
            message TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);
    results.createTable = 'OK';
    console.log('  Table created!');

    // Step 3: Insert data
    console.log('Step 3: Inserting test data...');
    const insertResult = await client.query(
        "INSERT INTO poc_test (message) VALUES ($1) RETURNING *",
        ['Hello from Cloud Run! Connection via Unix socket works.']
    );
    results.insert = { row: insertResult.rows[0] };
    console.log('  Inserted:', JSON.stringify(insertResult.rows[0]));

    // Step 4: Read back
    console.log('Step 4: Reading data back...');
    const selectResult = await client.query('SELECT COUNT(*) as total, MAX(created_at) as latest FROM poc_test');
    results.read = { row: selectResult.rows[0] };
    console.log('  Read:', JSON.stringify(selectResult.rows[0]));

    // Step 5: Drop table
    console.log('Step 5: Dropping test table...');
    await client.query('DROP TABLE poc_test');
    results.dropTable = 'OK';
    console.log('  Table dropped!');

    client.release();

    results.status = 'ALL TESTS PASSED';
    results.dbHost = process.env.DB_HOST;
    console.log('\n=== ALL TESTS PASSED ===\n');
    return results;
}

// Start HTTP server first (Cloud Run requires a listening port)
const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', async () => {
    console.log(`HTTP server listening on port ${PORT}`);
    console.log('');

    // Run the DB test automatically on startup
    try {
        const result = await runDbTest();
        console.log('Result:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('DB TEST FAILED:', error.message);
        console.error('Full error:', error);
    }
});
