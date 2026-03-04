/**
 * Standalone script to deploy/sync slash commands globally.
 * Run with: node src/deploy-commands.js
 */

import { REST, Routes } from 'discord.js';
import { validateEnv, config } from './config/env.js';
import { loadCommands } from './loader.js';
import { logger } from './utils/logger.js';

async function deploy() {
    validateEnv();

    // Create a temporary object to hold commands
    const holder = { commands: new Map() };
    await loadCommands(holder);

    const commands = [...holder.commands.values()].map(cmd => cmd.data.toJSON());
    const rest = new REST({ version: '10' }).setToken(config.token);

    logger.info(`Deploying ${commands.length} slash commands globally...`);

    await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
    logger.info('Done! Commands may take up to 1 hour to propagate globally.');
}

deploy().catch(err => {
    logger.fatal(`Deploy failed: ${err.message}`);
    process.exit(1);
});
