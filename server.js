require("dotenv").config();

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const authRoutes = require('./routes/auth');
const resumeRoutes = require('./routes/resume');
const { initDb } = require('./services/db');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Initialize SQLite DB
initDb(path.join(__dirname, '..', 'database', 'hireloop.db'));

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'HireLoop API' });
});

app.use('/api/auth', authRoutes);
app.use('/api', resumeRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`HireLoop backend listening on http://localhost:${PORT}`);
});

