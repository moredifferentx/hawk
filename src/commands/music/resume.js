import { SlashCommandBuilder, MessageFlags } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Resume the paused track');

export async function execute(interaction, client) {
    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
        return interaction.reply({ content: '🔇 Join a voice channel first!', flags: MessageFlags.Ephemeral });
    }

    const player = client.playerManager.shoukaku.players.get(interaction.guildId);
    if (!player) {
        return interaction.reply({ content: '❌ Nothing is playing.', flags: MessageFlags.Ephemeral });
    }

    if (!player.paused) {
        return interaction.reply({ content: '▶️ Already playing!', flags: MessageFlags.Ephemeral });
    }

    await player.setPaused(false);
    const queue = client.playerManager.queues.get(interaction.guildId);
    if (queue) queue.paused = false;
    await interaction.reply({ content: '▶️ Resumed!', flags: MessageFlags.Ephemeral });
}
