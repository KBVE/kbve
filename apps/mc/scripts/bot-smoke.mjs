#!/usr/bin/env node
import mineflayer from 'mineflayer';

const HOST = process.env.MC_HOST ?? '127.0.0.1';
const PORT = Number(process.env.MC_PORT ?? '25565');
const USER = process.env.MC_USER ?? 'SmokeBot';
const VERSION = process.env.MC_VERSION ?? '1.21.11';
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? '90000');

console.log(`[bot-smoke] connecting host=${HOST}:${PORT} user=${USER} version=${VERSION}`);

const bot = mineflayer.createBot({
    host: HOST,
    port: PORT,
    username: USER,
    auth: 'offline',
    version: VERSION,
});

const timer = setTimeout(() => {
    console.error(`[bot-smoke] no spawn within ${TIMEOUT_MS}ms — fail`);
    bot.end();
    process.exit(1);
}, TIMEOUT_MS);

bot.once('spawn', () => {
    clearTimeout(timer);
    console.log(`[bot-smoke] spawned at ${JSON.stringify(bot.entity.position)} on ${bot.game.dimension}`);
    setTimeout(() => {
        bot.quit('smoke-ok');
        process.exit(0);
    }, 1500);
});

bot.on('kicked', (reason) => {
    clearTimeout(timer);
    console.error(`[bot-smoke] kicked: ${reason}`);
    process.exit(1);
});

bot.on('error', (err) => {
    clearTimeout(timer);
    console.error(`[bot-smoke] error: ${err.message}`);
    process.exit(1);
});
