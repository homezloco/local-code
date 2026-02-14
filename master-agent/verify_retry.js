const axios = require('axios');
const initDb = require('./config/initDb');
const Task = require('./models/Task');
const DelegationEngine = require('./services/DelegationEngine');

async function testRetry() {
    console.log('Testing Auto-Retry Logic (Direct Service Mode)...');

    try {
        // 1. Initialize DB
        await initDb();

        // 2. Create a task that will fail
        const task = await Task.create({
            title: 'Fail me please (Test Retry)',
            description: 'This task is designed to trigger the simulated failure in DelegationEngine.',
            priority: 'high',
            status: 'pending'
        });

        const taskId = task.id;
        console.log(`Created Task: ${taskId}`);

        // 3. Delegate the task directly
        await DelegationEngine.delegateTask(taskId, {
            agentName: 'general', // force specific agent to avoid classification delay
            provider: 'ollama'
        });
        console.log('Delegation triggered.');

        // 4. Monitor status
        // We expect: delegated -> in_progress -> failed (retry 1) -> pending -> delegated -> in_progress -> failed (retry 2) -> ... -> failed (final)

        let retriesDetected = 0;
        const maxChecks = 30; // Increased checks

        for (let i = 0; i < maxChecks; i++) {
            await new Promise(r => setTimeout(r, 2000));
            const t = await Task.findByPk(taskId);

            console.log(`[${i}] Status: ${t.status}, RetryCount: ${t.metadata?.retryCount || 0}`);

            if (t.metadata?.retryCount > retriesDetected) {
                retriesDetected = t.metadata.retryCount;
                console.log(`>>> Retry ${retriesDetected} detected!`);
            }

            if (t.status === 'failed' && t.metadata?.retryCount >= 2) {
                console.log('Final failure state reached as expected.');
                break;
            }
        }

        if (retriesDetected >= 1) {
            console.log('SUCCESS: Auto-retry logic validated.');
        } else {
            console.log('FAILURE: No retries detected.');
        }

    } catch (err) {
        console.error('Test failed:', err.message);
        if (err.response) console.error(err.response.data);
    } finally {
        process.exit(0);
    }
}

testRetry();
