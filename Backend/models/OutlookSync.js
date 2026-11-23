// Backend/models/OutlookSync.js
// Estado de sincronización de cada calendario: el "deltaLink" de Microsoft
// Graph (marca de hasta dónde estamos al día) y la ventana de fechas que se
// está sincronizando.
const { Schema, model } = require('mongoose');

const OutlookSyncSchema = new Schema(
  {
    calendarId: { type: String, required: true, unique: true },
    deltaLink: { type: String, default: '' },
    windowStart: { type: String, default: '' }, // YYYY-MM-DD
    windowEnd: { type: String, default: '' },
    tz: { type: String, default: '' },
    lastSync: { type: Date, default: null },
    lastError: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = model('OutlookSync', OutlookSyncSchema);
