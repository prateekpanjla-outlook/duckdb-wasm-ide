#!/bin/bash
# Run the debug login/questions test in headed mode

cd /home/vagrant/Desktop/claude-code-zai/duckdb-wasm-project
npm run test:e2e -- tests/e2e/debug-login-questions.spec.js --headed
