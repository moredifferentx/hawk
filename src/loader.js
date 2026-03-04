import { readdir } from 'fs/promises';
import { pathToFileURL, fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { Collection, REST, Routes } from 'discord.js';
import { logger } from './utils/logger.js';
import { config } from './config/env.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Load all event handlers from src/events/
 */
export async function loadEvents(client) {
    const eventsPath = join(__dirname, 'events');
    const eventFiles = (await readdir(eventsPath)).filter(f => f.endsWith('.js'));

    for (const file of eventFiles) {
        const event = await import(pathToFileURL(join(eventsPath, file)).href);
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args, client));
        } else {
            client.on(event.name, (...args) => event.execute(...args, client));
        }
        logger.info(`Loaded event: ${event.name}`);
    }
}

/**
 * Load all commands from src/commands/** /
 */
export async function loadCommands(client) {
    client.commands = new Collection();
    const commandsPath = join(__dirname, 'commands');
    const categories = await readdir(commandsPath);

    for (const category of categories) {
        const categoryPath = join(commandsPath, category);
        let files;
        try {
            files = (await readdir(categoryPath)).filter(f => f.endsWith('.js'));
        } catch {
            continue; // not a directory
        }

        for (const file of files) {
            const command = await import(pathToFileURL(join(categoryPath, file)).href);
            if (command.data && command.execute) {
                client.commands.set(command.data.name, command);
                logger.info(`Loaded command: /${command.data.name}`);
            }
        }
    }
}

/**
 * Register slash commands with Discord API
 */
export async function syncCommands(client) {
    const commands = client.commands.map(cmd => cmd.data.toJSON());
    const rest = new REST({ version: '10' }).setToken(config.token);

    try {
        logger.info(`Syncing ${commands.length} slash commands...`);
        await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
        logger.info('Slash commands synced globally');
    } catch (err) {
        logger.error(`Failed to sync commands: ${err.message}`);
    }
}
