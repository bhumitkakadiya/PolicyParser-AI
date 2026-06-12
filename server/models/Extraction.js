import mongoose from 'mongoose';

const extractionSchema = new mongoose.Schema({
  filename: {
    type: String,
    required: true,
  },
  extractedData: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  status: {
    type: String,
    enum: ['success', 'error'],
    default: 'success',
  },
  batchId: {
    type: String,
    required: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model('Extraction', extractionSchema);
