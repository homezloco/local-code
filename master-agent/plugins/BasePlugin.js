class BasePlugin {
  constructor() {
    if (new.target === BasePlugin) {
      throw new Error('BasePlugin cannot be instantiated directly');
    }

    this.name = this.constructor.name;
    this.version = '1.0.0';
    this.isActive = false;
  }

  async initialize() {
    if (this.isActive) {
      throw new Error(`Plugin ${this.name} is already initialized`);
    }

    try {
      await this.onInitialize();
      this.isActive = true;
      console.log(`Plugin ${this.name} initialized successfully`);
    } catch (error) {
      console.error(`Error initializing plugin ${this.name}:`, error);
      throw error;
    }
  }

  async onInitialize() {
    // To be implemented by subclasses
    return Promise.resolve();
  }

  async cleanup() {
    if (!this.isActive) {
      throw new Error(`Plugin ${this.name} is not initialized`);
    }

    try {
      await this.onCleanup();
      this.isActive = false;
      console.log(`Plugin ${this.name} cleaned up successfully`);
    } catch (error) {
      console.error(`Error cleaning up plugin ${this.name}:`, error);
      throw error;
    }
  }

  async onCleanup() {
    // To be implemented by subclasses
    return Promise.resolve();
  }

  async execute(action, ...args) {
    if (!this.isActive) {
      throw new Error(`Plugin ${this.name} is not active`);
    }

    const method = this[action];
    if (typeof method === 'function') {
      return method.apply(this, args);
    } else {
      throw new Error(`Action ${action} not found in plugin ${this.name}`);
    }
  }
}

module.exports = {
  BasePlugin
};
