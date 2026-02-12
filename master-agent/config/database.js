const { Sequelize } = require('sequelize');
require('dotenv').config();

const usePostgres = process.env.DB_DIALECT === 'postgres';

const sequelize = usePostgres
  ? new Sequelize(process.env.DB_NAME || 'master_agent', process.env.DB_USER || 'postgres', process.env.DB_PASSWORD || '', {
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 5432),
      dialect: 'postgres',
      logging: process.env.DB_LOGGING === 'true' ? console.log : false,
      pool: {
        max: Number(process.env.DB_POOL_MAX || 10),
        min: Number(process.env.DB_POOL_MIN || 0),
        acquire: Number(process.env.DB_POOL_ACQUIRE || 20000),
        idle: Number(process.env.DB_POOL_IDLE || 10000)
      }
    })
  : new Sequelize({
      dialect: 'sqlite',
      storage: process.env.SQLITE_PATH || './database.sqlite',
      logging: process.env.NODE_ENV === 'development' ? console.log : false
    });

const db = {
  Sequelize,
  sequelize,
  models: {}
};

module.exports = db;