// Backend/models/OutlookEvento.js
// Copia local de las citas de Outlook. Se mantiene con sincronización
// incremental (delta): la pantalla lee de aquí, no de Outlook.
//
// `start` y `end` son la hora "de reloj" en la zona de OUTLOOK_TZ, como texto
// ISO sin zona (YYYY-MM-DDTHH:mm:ss). Así se comparan por orden alfabético y
// se muestran idénticas a Outlook, sin conversiones.
const { Schema, model } = require('mongoose');

const OutlookEventoSchema = new Schema(
  {
    calendarId: { type: String, required: true }, // "primary" o id de Graph
    eventId: { type: String, required: true },

    subject: { type: String, default: '' },
    start: { type: String, required: true },
    end: { type: String, required: true },
    isAllDay: { type: Boolean, default: false },

    location: { type: String, default: '' },
    preview: { type: String, default: '' },
    organizer: { type: String, default: '' },
    attendees: { type: [String], default: [] },
    categories: { type: [String], default: [] },
    webLink: { type: String, default: '' },
  },
  { timestamps: false }
);

OutlookEventoSchema.index({ calendarId: 1, eventId: 1 }, { unique: true });
OutlookEventoSchema.index({ calendarId: 1, start: 1, end: 1 });

module.exports = model('OutlookEvento', OutlookEventoSchema);
