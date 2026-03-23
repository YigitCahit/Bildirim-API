const { Queue } = require('bullmq');
const { connection } = require('../config/redis');
const { env } = require('../config/env');

const queue = new Queue(env.queueName, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    },
    removeOnComplete: true,
    removeOnFail: 1000
  }
});

async function enqueueDeliveryAttempt(attemptId) {
  await queue.add('send-delivery', { attemptId }, { jobId: attemptId });
}

module.exports = {
  queue,
  enqueueDeliveryAttempt
};
