import 'dotenv/config';
import { Sequelize } from 'sequelize';

const portaBancoDeDados = Number(process.env.MYSQL_PORT ?? 3306);

export const bancoDeDados = new Sequelize(
  process.env.MYSQL_DATABASE,
  process.env.MYSQL_USER,
  process.env.MYSQL_PASSWORD,
  {
    host: process.env.MYSQL_HOST,
    port: portaBancoDeDados,
    dialect: 'mysql',
    logging: false,
  },
);
