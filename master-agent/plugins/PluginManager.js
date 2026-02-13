const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');
const { BasePlugin } = require('./BasePlugin');

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

      const pluginFiles = fs
        .readdirSync(this.pluginDir)
        .filter((file) => file.endsWith('.js') || file.endsWith('.ts'))
        // Skip helper/abstract files
        .filter((file) => !['BasePlugin.js', 'PluginManager.js'].includes(file));

      for (const file of pluginFiles) {
        try {
          const pluginPath = path.join(this.pluginDir, file);
          const pluginModule = require(pluginPath);
          const exported = pluginModule?.default || Object.values(pluginModule)[0];
          if (!exported) {
            logger.warn(`Invalid plugin structure (no export): ${pluginPath}`);
            continue;
          }

          const plugin = typeof exported === 'function' ? new exported() : exported;

          if (!plugin) {
            logger.warn(`Invalid plugin structure (null/undefined): ${pluginPath}`);
            continue;
          }

          const isValidInstance = plugin instanceof BasePlugin;
          if (isValidInstance && plugin.name && plugin.version && typeof plugin.initialize === 'function') {
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
      const exportKey = Object.keys(pluginModule)[0];
      const candidate = pluginModule[exportKey];
      const plugin = typeof candidate === 'function' ? new candidate() : candidate;
      if (plugin instanceof BasePlugin) {
        await this.registerPlugin(plugin);
      } else {
        logger.warn(`Cannot reload plugin ${name}: invalid structure`);
      }
    }
  }
}

module.exports = PluginManager;
