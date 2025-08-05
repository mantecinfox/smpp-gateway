module.exports = {
  apps: [{
    name: "smpp-gateway",
    script: "server.js",
    instances: 1,
    autorestart: true,
    watch: false,
    env: {
      NODE_ENV: "production"
    }
  }]
}
