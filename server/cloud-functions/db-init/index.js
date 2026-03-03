/**
 * Cloud Function for database initialization
 *
 * Provides HTTP endpoints for database operations:
 * - GET  / - Health check
 * - POST /migrate - Run database migrations
 * - POST /seed - Seed database with questions
 * - POST /init - Initialize (migrate + seed)
 *
 * Trigger: HTTP
 * Runtime: Node.js 18
 */

import { migrateDatabase } from './migrate.js';
import { seedQuestions } from './seed.js';

// Simple HTTP request handler
export async function initDatabase(request, response) {
    // Set CORS headers
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (request.method === 'OPTIONS') {
        response.status(200).end();
        return;
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
        if (path === '/' || path === '/health') {
            response.writeHead(200, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({
                service: 'db-init-service',
                status: 'running',
                endpoints: {
                    migrate: '/migrate',
                    seed: '/seed',
                    init: '/init'
                }
            }));
            return;
        }

        if (path === '/migrate' && request.method === 'POST') {
            console.log('📋 Running database migrations...');
            await migrateDatabase();
            console.log('✅ Migrations completed');

            response.writeHead(200, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({
                status: 'ok',
                message: 'Database migrations completed successfully'
            }));
            return;
        }

        if (path === '/seed' && request.method === 'POST') {
            console.log('🌱 Seeding database...');
            await seedQuestions();
            console.log('✅ Database seeded');

            response.writeHead(200, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({
                status: 'ok',
                message: 'Database seeded successfully'
            }));
            return;
        }

        if (path === '/init' && request.method === 'POST') {
            console.log('🚀 Starting database initialization...');

            // Run migrations
            await migrateDatabase();
            console.log('✅ Migrations completed');

            // Seed database
            await seedQuestions();
            console.log('✅ Seeding completed');

            response.writeHead(200, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({
                status: 'ok',
                message: 'Database initialized successfully (migrated + seeded)'
            }));
            return;
        }

        // 404 for unknown paths
        response.writeHead(404, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'Not found' }));

    } catch (error) {
        console.error('❌ Error:', error);
        response.writeHead(500, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({
            status: 'error',
            error: error.message
        }));
    }
}
