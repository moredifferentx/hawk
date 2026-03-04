import { SlashCommandBuilder, MessageFlags } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('disconnect')
    .setDescription('Disconnect the bot from the voice channel');

export async function execute(interaction, client) {
    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
        return interaction.reply({ content: '🔇 Join a voice channel first!', flags: MessageFlags.Ephemeral });
    }

    await client.playerManager.destroy(interaction.guildId);
    await interaction.reply({ content: '👋 Disconnected.', flags: MessageFlags.Ephemeral });
}
