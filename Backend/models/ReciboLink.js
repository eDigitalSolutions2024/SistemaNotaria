// models/ReciboLink.js
const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

const ReciboLinkSchema = new Schema({
  reciboId: { type: Types.ObjectId, ref: 'Recibo', required: true, index: true },
  control:  { type: Number, required: true, index: true }, // # de trámite
  createdAt:{ type: Date, default: Date.now }
}, { versionKey: false });

ReciboLinkSchema.index({ reciboId: 1, control: 1 }, { unique: true });

module.exports = mongoose.model('ReciboLink', ReciboLinkSchema);
