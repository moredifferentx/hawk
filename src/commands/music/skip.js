import { SlashCommandBuilder, MessageFlags } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the current track');

export async function execute(interaction, client) {
    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
        return interaction.reply({ content: '🔇 Join a voice channel first!', flags: MessageFlags.Ephemeral });
    }

    const queue = client.playerManager.queues.get(interaction.guildId);
    if (!queue?.currentTrack) {
        return interaction.reply({ content: '❌ Nothing is playing.', flags: MessageFlags.Ephemeral });
    }

    await client.playerManager.skip(interaction.guildId);
    await interaction.reply({ content: '⏭ Skipped!', flags: MessageFlags.Ephemeral });
}
