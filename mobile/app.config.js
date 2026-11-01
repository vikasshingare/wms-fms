module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    ...(process.env.SERVICE360_WEB_BASE ? { baseUrl: process.env.SERVICE360_WEB_BASE } : {}),
  },
});
