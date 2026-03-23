const webPush = require('web-push');
const { env } = require('../config/env');

webPush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);

async function sendWebPush(subscription, payload) {
  const pushSubscription = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh,
      auth: subscription.auth
    }
  };

  const options = {
    TTL: payload.ttl || env.defaultTtl,
    urgency: payload.urgency || 'normal',
    topic: payload.topic
  };

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url,
    data: payload.data || {}
  });

  return webPush.sendNotification(pushSubscription, body, options);
}

module.exports = {
  sendWebPush
};
