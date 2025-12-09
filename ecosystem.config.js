module.exports = {
  apps: [
    {
      name: 'youtulabs-backend',
      script: './src/server.js',
      instances: 3,
      exec_mode: 'cluster',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
      },
      error_file: '/root/.pm2/logs/youtulabs-backend-error.log',
      out_file: '/root/.pm2/logs/youtulabs-backend-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
    {
      name: 'youtulabs-worker',
      script: './src/queue/storyWorker.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
      },
      error_file: '/root/.pm2/logs/youtulabs-worker-error.log',
      out_file: '/root/.pm2/logs/youtulabs-worker-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
