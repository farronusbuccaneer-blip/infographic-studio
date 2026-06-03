/**
 * Database setup using Dexie.js
 */
const db = new Dexie('InfoGraphicAppDB');

// Define database schema
// id is the unique key (UUID string or default ID).
// templates: Stores background images with Base64 data_url.
// overlays: Stores transparent PNG overlays with Base64 data_url.
// configs: Stores bounding box configurations for text elements mapping.
db.version(1).stores({
  templates: 'id, name, created_at',
  overlays: 'id, name, created_at',
  configs: 'template_id'
});
