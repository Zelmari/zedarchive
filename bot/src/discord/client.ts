import { Client, GatewayIntentBits, Partials } from 'discord.js';

export function createBotClient(): Client {
  return new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
    partials: [Partials.Channel],
  });
}
