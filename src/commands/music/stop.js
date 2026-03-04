import { SlashCommandBuilder, MessageFlags } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop playback and clear the queue');

export async function execute(interaction, client) {
    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
        return interaction.reply({ content: '🔇 Join a voice channel first!', flags: MessageFlags.Ephemeral });
    }

    await client.playerManager.destroy(interaction.guildId);
    await interaction.reply({ content: '⏹ Stopped and cleared the queue.', flags: MessageFlags.Ephemeral });
}
