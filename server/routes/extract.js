import express from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { extractFromPdf } from '../services/geminiExtractor.js';
import Extraction from '../models/Extraction.js';

const router = express.Router();

// Helper: check if MongoDB is connected
function isDbConnected() {
  return mongoose.connection.readyState === 1; // 1 = connected
}

const HISTORY_FILE = path.join(process.cwd(), '..', 'history.json');

function getLocalHistory() {
  if (fs.existsSync(HISTORY_FILE)) {
    try {
      const data = fs.readFileSync(HISTORY_FILE, 'utf8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }
  return [];
}

function saveLocalHistory(extraction) {
  const history = getLocalHistory();
  history.push(extraction);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
}

function deleteLocalHistory(id) {
  let history = getLocalHistory();
  history = history.filter(ex => String(ex._id) !== String(id));
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
}

// ── Multer config: memory storage, PDF only, 50 MB max ──
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  },
});


// ── POST /api/extract — Upload PDF & extract data ──────────
router.post('/extract', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    console.log(`[API] Processing: ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} KB)`);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' });
    }

    // Extract data via Gemini
    const data = await extractFromPdf(req.file.buffer, apiKey);

    // Save result to .txt file in the main project folder
    try {
      const txtPath = path.join(process.cwd(), '..', 'result.txt');
      fs.writeFileSync(txtPath, JSON.stringify(data, null, 2), 'utf8');
      console.log(`[API] Saved data locally to result.txt`);
    } catch (fsErr) {
      console.warn('[API] Could not save result.txt locally:', fsErr.message);
    }

    // Try to save to MongoDB (non-blocking — works without DB)
    let savedId = null;
    if (isDbConnected()) {
      try {
        const extraction = new Extraction({
          filename: req.file.originalname,
          extractedData: data,
          status: 'success',
          batchId: req.body.batchId || null,
        });
        const saved = await extraction.save();
        savedId = saved._id;
        console.log(`[DB] Saved extraction: ${savedId}`);
      } catch (dbErr) {
        console.warn('[DB] Could not save to MongoDB:', dbErr.message);
      }
    } else {
      console.warn('[DB] MongoDB not connected — falling back to local JSON history');
      savedId = 'local-' + Date.now();
      const extraction = {
        _id: savedId,
        filename: req.file.originalname,
        extractedData: data,
        status: 'success',
        batchId: req.body.batchId || null,
        createdAt: new Date().toISOString()
      };
      saveLocalHistory(extraction);
    }

    res.json({
      success: true,
      id: savedId,
      filename: req.file.originalname,
      data,
    });
  } catch (err) {
    console.error('[API] Extraction error:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// ── GET /api/extractions — List all past extractions ───────
router.get('/extractions', async (_req, res) => {
  if (!isDbConnected()) {
    const history = getLocalHistory();
    history.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return res.json(history);
  }
  try {
    const extractions = await Extraction.find()
      .sort({ createdAt: -1 })
      .select('filename status createdAt batchId extractedData.policy.policy_number extractedData.policy_holder.name')
      .maxTimeMS(5000);
    res.json(extractions);
  } catch (err) {
    // If MongoDB query fails, return empty array
    console.warn('[DB] Query failed:', err.message);
    res.json([]);
  }
});


// ── GET /api/extractions/:id — Get a specific extraction ──
router.get('/extractions/:id', async (req, res) => {
  if (!isDbConnected()) {
    const history = getLocalHistory();
    const extraction = history.find(ex => String(ex._id) === String(req.params.id));
    if (!extraction) {
      return res.status(404).json({ error: 'Extraction not found' });
    }
    return res.json(extraction);
  }
  try {
    const extraction = await Extraction.findById(req.params.id).maxTimeMS(5000);
    if (!extraction) {
      return res.status(404).json({ error: 'Extraction not found' });
    }
    res.json(extraction);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ── DELETE /api/extractions/:id — Delete an extraction ─────
router.delete('/extractions/:id', async (req, res) => {
  if (!isDbConnected()) {
    deleteLocalHistory(req.params.id);
    return res.json({ success: true });
  }
  try {
    await Extraction.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


export default router;

