const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const Redis = require('ioredis');
const { Pool } = require('pg');           // ← НОВА БІБЛІОТЕКА

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const redis = new Redis(process.env.REDIS_URL || process.env.KEY_VALUE_URL);

// ←←← НОВЕ: PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,  // Render додасть автоматично
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});
// автоматично створить таблицю при першому запуску
pool.query(`
  CREATE TABLE IF NOT EXISTS sensor_data (
    id SERIAL PRIMARY KEY,
    t TIMESTAMPTZ DEFAULT NOW(),
    temp REAL,
    hum REAL,
    soil INTEGER
  )
`);

const LIST_KEY = 'sensor:points';

app.post('/data', async (req, res) => {
  try {
    const { soil, temp, hum } = req.body;
    if (soil == null || temp == null || hum == null)
      return res.status(400).json({ok:false, error:'missing'});

    const point = { t: Date.now(), soil: Number(soil), temp: Number(temp), hum: Number(hum) };
    const payload = JSON.stringify(point);

    // 1. Redis (для живих графіків)
    await redis.rpush(LIST_KEY, payload);
    await redis.ltrim(LIST_KEY, -10000, -1);
    await redis.publish('sensor:channel', payload);

    // 2. PostgreSQL (назавжди)
    await pool.query(
      'INSERT INTO sensor_data(temp, hum, soil) VALUES($1,$2,$3)',
      [point.temp, point.hum, point.soil]
    );

    res.json({ok:true});
  } catch (err) {
    console.error(err);
    res.status(500).json({ok:false});
  }
});

// Новий ендпоінт: історія з БД (будь-який період)
app.get('/history-db', async (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const result = await pool.query(
    `SELECT t, temp, hum, soil 
     FROM sensor_data 
     WHERE t > NOW() - INTERVAL '${days} days'
     ORDER BY t`
  );
  res.json(result.rows);
});
