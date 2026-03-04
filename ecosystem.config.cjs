/**
 * PM2 Ecosystem Config — VPS Process Management
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs        # Start bot
 *   pm2 stop discord-music-bot            # Stop bot
 *   pm2 restart discord-music-bot         # Restart bot
 *   pm2 logs discord-music-bot            # View logs
 *   pm2 monit                             # Live monitoring
 *   pm2 startup                           # Auto-start on reboot
 *   pm2 save                              # Save current process list
 *
 * First time on VPS:
 *   npm install -g pm2
 *   node setup.js --no-start              # Setup everything without launching bot
 *   pm2 start ecosystem.config.cjs        # Launch with PM2
 *   pm2 startup && pm2 save               # Auto-start on reboot
 */

module.exports = {
    apps: [
        {
            name: 'discord-music-bot',
            script: 'src/bot.js',
            cwd: __dirname,

            // Restart policy
            autorestart: true,
            max_restarts: 10,
            min_uptime: '10s',           // Must run 10s before considered "started"
            restart_delay: 5000,         // Wait 5s between restarts

            // Memory management
            max_memory_restart: '1G',    // Restart if >1GB RAM

            // Logging
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            error_file: 'logs/bot-error.log',
            out_file: 'logs/bot-out.log',
            merge_logs: true,
            log_type: 'json',

            // Environment
            env: {
                NODE_ENV: 'production',
                FORCE_COLOR: '1',
            },

            // Graceful shutdown
            kill_timeout: 10000,         // 10s for cleanup before SIGKILL
            listen_timeout: 30000,

            // Watch (disabled in production)
            watch: false,
        },
    ],
};
