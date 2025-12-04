const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Підключення до БД (Render сам додасть DATABASE_URL)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Створення таблиці при першому запуску
pool.query(`
  CREATE TABLE IF NOT EXISTS sensor_data (
    id SERIAL PRIMARY KEY,
    t TIMESTAMPTZ DEFAULT NOW(),
    temp REAL,
    hum REAL,
    soil INTEGER
  )
`);

// Приймаємо дані з ESP32
app.post('/data', async (req, res) => {
  try {
    const { temp, hum, soil } = req.body;
    await pool.query(
      'INSERT INTO sensor_data (temp, hum, soil) VALUES ($1, $2, $3)',
      [temp, hum, soil]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false });
  }
});

// Віддаємо історію
app.get('/history', async (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const result = await pool.query(
    `SELECT t, temp, hum, soil FROM sensor_data 
     WHERE t > NOW() - INTERVAL '${days} days' 
     ORDER BY t`
  );
  res.json(result.rows);
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Сервер на порту ${port}`));
