import { SlashCommandBuilder, MessageFlags } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Set the loop mode')
    .addStringOption(opt =>
        opt.setName('mode')
            .setDescription('Loop mode')
            .setRequired(true)
            .addChoices(
                { name: '❌ Off', value: 'off' },
                { name: '🔂 Track', value: 'track' },
                { name: '🔁 Queue', value: 'queue' },
            )
    );

export async function execute(interaction, client) {
    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
        return interaction.reply({ content: '🔇 Join a voice channel first!', flags: MessageFlags.Ephemeral });
    }

    const queue = client.playerManager.queues.get(interaction.guildId);
    if (!queue) {
        return interaction.reply({ content: '❌ Nothing is playing.', flags: MessageFlags.Ephemeral });
    }

    const mode = interaction.options.getString('mode');
    queue.loopMode = mode;
    queue.saveSettings();

    const modeText = { off: '❌ Off', track: '🔂 Track', queue: '🔁 Queue' };
    await interaction.reply({ content: `Loop: **${modeText[mode]}**`, flags: MessageFlags.Ephemeral });
}
