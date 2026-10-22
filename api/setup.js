// Open https://YOUR-APP/api/setup once after deploying: connects the Telegram bot to this app.
// Safe to open again at any time.
import { json, tg, WEBHOOK_SECRET, appUrl, SERVICE_KEY, BOT_TOKEN } from './_lib.js';

export default async function handler(req, res) {
  const checks = { service_key: !!SERVICE_KEY, bot_token: !!BOT_TOKEN };
  if (!BOT_TOKEN) return json(res, 200, { ok: false, checks, error: 'Add TELEGRAM_BOT_TOKEN in Vercel → Settings → Environment Variables, then redeploy.' });
  const me = await tg('getMe', {});
  const hook = await tg('setWebhook', {
    url: `${appUrl(req)}/api/telegram`,
    secret_token: WEBHOOK_SECRET,
    allowed_updates: ['message', 'edited_message', 'callback_query'],
    drop_pending_updates: true,
  });
  await tg('setMyCommands', { commands: [
    { command: 'jobs', description: 'My jobs / ჩემი შეკვეთები' },
  ] });
  return json(res, 200, { ok: !!(me.ok && hook.ok), checks, bot: me.result?.username, webhook: hook.description || hook.ok });
}
