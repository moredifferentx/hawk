import { SlashCommandBuilder, MessageFlags } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('247')
    .setDescription('Toggle 24/7 mode — bot stays in voice channel permanently');

export async function execute(interaction, client) {
    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
        return interaction.reply({ content: '🔇 Join a voice channel first!', flags: MessageFlags.Ephemeral });
    }

    const queue = client.playerManager.getQueue(interaction.guildId);
    queue.twentyFourSeven = !queue.twentyFourSeven;
    queue.saveSettings();

    await interaction.reply({
        content: queue.twentyFourSeven
            ? '🌙 **24/7 mode enabled** — I\'ll stay in the voice channel even when idle.'
            : '☀️ **24/7 mode disabled** — I\'ll leave after 2 minutes of inactivity.',
        flags: MessageFlags.Ephemeral,
    });
}
