const { z } = require('zod');

const PingSchema = z.object({
  message: z.string().default('hello from plugin'),
});

module.exports = {
  async initialize(ctx) {
    ctx.log.info('hello-plugin initialized', { pluginId: ctx.pluginId });
  },
  getCommands() {
    return [
      {
        command: 'hello',
        schema: PingSchema,
        handler: async (payload) => ({
          echo: payload.message,
          plugin: 'hello-plugin',
          at: new Date().toISOString(),
        }),
      },
    ];
  },
};
