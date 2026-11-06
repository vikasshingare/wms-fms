module.exports = ({ config }) => ({
  ...config,
  plugins: [...(config.plugins || []), './plugins/withReleaseSigning'],
  experiments: {
    ...config.experiments,
    ...(process.env.SERVICE360_WEB_BASE ? { baseUrl: process.env.SERVICE360_WEB_BASE } : {}),
  },
});
