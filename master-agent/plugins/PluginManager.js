const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');

class PluginManager {
  constructor() {
    this.plugins = new Map();
    this.pluginDir = path.join(__dirname, '../plugins');
  }

  async loadPlugins() {
    try {
      if (!fs.existsSync(this.pluginDir)) {
        fs.mkdirSync(this.pluginDir, { recursive: true });
      }

      const pluginFiles = fs.readdirSync(this.pluginDir).filter(file => 
        file.endsWith('.js') || file.endsWith('.ts')
      );

      for (const file of pluginFiles) {
        try {
          const pluginPath = path.join(this.pluginDir, file);
          const pluginModule = require(pluginPath);
          const plugin = pluginModule[Object.keys(pluginModule)[0]];

          if (plugin && plugin.name && plugin.version && plugin.initialize) {
            await this.registerPlugin(plugin);
            logger.info(`Loaded plugin: ${plugin.name} v${plugin.version}`);
          } else {
            logger.warn(`Invalid plugin structure: ${pluginPath}`);
          }
        } catch (error) {
          logger.error(`Error loading plugin ${file}:`, error);
        }
      }
    } catch (error) {
      logger.error('Error loading plugins:', error);
    }
  }

  async registerPlugin(plugin) {
    try {
      await plugin.initialize();
      this.plugins.set(plugin.name, plugin);
    } catch (error) {
      logger.error(`Error initializing plugin ${plugin.name}:`, error);
      throw error;
    }
  }

  getPlugin(name) {
    return this.plugins.get(name);
  }

  getAllPlugins() {
    return Array.from(this.plugins.values());
  }

  async unloadPlugin(name) {
    const plugin = this.plugins.get(name);
    if (plugin && plugin.cleanup) {
      await plugin.cleanup();
    }
    this.plugins.delete(name);
  }

  async reloadPlugin(name) {
    await this.unloadPlugin(name);
    const pluginPath = path.join(this.pluginDir, `${name}.js`);
    if (fs.existsSync(pluginPath)) {
      const pluginModule = require(pluginPath);
      const plugin = pluginModule[Object.keys(pluginModule)[0]];
      await this.registerPlugin(plugin);
    }
  }
}

module.exports = PluginManager;
