module.exports = {
  apps: [
    {
      name: 'madrcs-backend',
      script: 'dist/index.js',
      instances: '1', // Set to 'max' for cluster mode if your CPU supports it
      exec_mode: 'fork', // Set to 'cluster' for multi-instance scaling
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 5000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000
      }
    }
  ]
};
