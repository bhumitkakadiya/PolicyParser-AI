import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import extractRoutes from './routes/extract.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ──────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ── MongoDB Connection (graceful — app works without it) ──
mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 5000,
})
  .then(() => console.log('[DB] MongoDB connected successfully'))
  .catch(err => {
    console.warn('[DB] MongoDB not available — history will not be saved.');
    console.warn(`     ${err.message}`);
  });

// ── Routes ─────────────────────────────────────────
app.use('/api', extractRoutes);

// ── Health Check ───────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Start Server ───────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n============================================`);
  console.log(`  Insurance Extractor API`);
  console.log(`  Running on: http://localhost:${PORT}`);
  console.log(`============================================\n`);
});
