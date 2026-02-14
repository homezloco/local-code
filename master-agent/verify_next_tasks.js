const fs = require('fs');
const path = require('path');

// Configure isolated test environment BEFORE requiring db/models
process.env.SQLITE_PATH = './test_verify.sqlite';
process.env.DB_SYNC_STRATEGY = 'sync'; // Will create tables in new DB
process.env.NODE_ENV = 'test';

const initDb = require('./config/initDb');
const Task = require('./models/Task');
const DelegationEngine = require('./services/DelegationEngine');

async function verifyNextTasks() {
    console.log('Verifying Agent-Driven Task Creation (Isolated DB)...');
    try {
        // 1. Initialize Test DB (Force sync to create tables)
        await initDb();

        // 2. Create Parent Task
        const parent = await Task.create({
            title: 'Test Next Tasks',
            description: 'Should generate a child task',
            status: 'pending'
        });
        console.log(`Parent Task Created: ${parent.id}`);

        // 3. Delegate (Mock trigger)
        // We use a provider that returns fast results or mock in DelegationEngine handles it
        await DelegationEngine.delegateTask(parent.id, {
            agentName: 'general',
            autonomous: true
        });

        console.log('Delegation triggered. Waiting for execution...');

        // Wait for delegation to complete (polling)
        // We can check the parent task's status or the delegation status if we had the ID
        // Since we don't have the delegation ID easily from void return of delegateTask (wait, it returns delegation),
        // let's just poll the parent task/child tasks.

        let children = [];
        for (let i = 0; i < 10; i++) {
            await new Promise(r => setTimeout(r, 1000));
            children = await Task.findAll({ where: { parentId: parent.id } });
            if (children.length > 0) break;
            console.log(`[${i + 1}/10] Waiting for child tasks...`);
        }

        console.log('Checking for children...');

        // 4. Check for child
        if (children.length > 0) {
            console.log(`SUCCESS: Found ${children.length} child tasks.`);
            console.log(`Child: ${children[0].title} (Parent: ${children[0].parentId})`);
        } else {
            console.error('FAILURE: No child tasks found.');
        }

    } catch (err) {
        console.error('Verification Failed:', err);
    } finally {
        // Cleanup
        try {
            if (fs.existsSync(process.env.SQLITE_PATH)) {
                // unexpected lock might prevent unlink immediately, but try
                // fs.unlinkSync(process.env.SQLITE_PATH); 
                // Actually, keep it for debug if needed, or delete.
                console.log('Test complete. DB file: test_verify.sqlite');
            }
        } catch (e) { console.error('Cleanup failed:', e.message); }
        process.exit(0);
    }
}

verifyNextTasks();
