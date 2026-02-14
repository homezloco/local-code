const fetch = globalThis.fetch || ((...args) => import('node-fetch').then(({ default: f }) => f(...args)));
const logger = require('../config/logger');

const WEBHOOK_URL = process.env.WEBHOOK_URL;

class NotificationService {
    static async send(event, payload) {
        if (!WEBHOOK_URL) return;

        try {
            const body = {
                event,
                timestamp: new Date().toISOString(),
                ...payload
            };

            const response = await fetch(WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                logger.warn(`Webhook failed (${response.status}): ${response.statusText}`);
            } else {
                logger.info(`Webhook sent: ${event}`);
            }
        } catch (err) {
            logger.error(`Webhook error: ${err.message}`);
        }
    }

    static async notifyTaskCompleted(task, result) {
        await this.send('task.completed', {
            taskId: task.id,
            title: task.title,
            status: 'completed',
            result: result.plan || result.finalAnswer || result,
            agent: task.assignedTo
        });
    }

    static async notifyTaskFailed(task, errorStr) {
        await this.send('task.failed', {
            taskId: task.id,
            title: task.title,
            status: 'failed',
            error: errorStr,
            agent: task.assignedTo
        });
    }

    static async notifyTaskCancelled(task, reason) {
        await this.send('task.cancelled', {
            taskId: task.id,
            title: task.title,
            status: 'cancelled',
            reason,
            agent: task.assignedTo
        });
    }
}

module.exports = NotificationService;
