// =======================================
// Lessons App Backend
// =======================================

// I load environment variables so I can keep sensitive data like my MongoDB URI outside the code.
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { MongoClient } = require('mongodb');

const app = express();

// Middleware
// I use CORS to allow requests from my frontend, express.json to read JSON data, and morgan for request logging.
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Health and root routes
// These help me quickly check if the server is running even when the database isn’t connected.
app.get('/', (_req, res) => {
  res.status(200).send('Lessons API is running. Try GET /health or /api/lessons');
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, status: 'healthy', time: new Date().toISOString() });
});

// Route lister
// I added this to easily see all active routes while testing.
app.get('/__routes', (req, res) => {
  const stack = (app._router && Array.isArray(app._router.stack)) ? app._router.stack : [];
  const routes = stack
    .filter(r => r.route && r.route.path)
    .map(r => ({
      method: Object.keys(r.route.methods)[0]?.toUpperCase() || 'GET',
      path: r.route.path
    }));
  res.json(routes);
});

// Database setup
// I connect to MongoDB Atlas using my connection string. If .env isn’t found, it defaults to my own cluster.
const uri = process.env.MONGO_URI ||
  'mongodb+srv://abdullahisalah3:daadir22@cluster0.coj6nag.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const dbName = process.env.DB_NAME || 'lessons_app';

let db, Lessons, Orders;

// This function connects my app to the database and sets up the collections I use.
async function connectDB() {
  const client = new MongoClient(uri);
  await client.connect();
  db = client.db(dbName);
  Lessons = db.collection('lessons');
  Orders = db.collection('orders');
  console.log('Connected to MongoDB Atlas');
}

// GET /api/lessons
// This fetches all lessons from my database so they can be displayed on the frontend.
app.get('/api/lessons', async (_req, res) => {
  try {
    if (!Lessons) throw new Error('Database not ready');
    const lessons = await Lessons.find().toArray();
    res.json(lessons);
  } catch (err) {
    console.error('GET /api/lessons error:', err.message);
    res.status(500).json({ message: 'Failed to load lessons' });
  }
});

// POST /api/order
// When someone checks out, I save their order here after basic input validation.
app.post('/api/order', async (req, res) => {
  try {
    if (!Orders) throw new Error('Database not ready');
    const { name, phone, items, total } = req.body;

    // Basic validation for safety
    if (!/^[a-zA-Z ]+$/.test(name || '')) return res.status(400).json({ message: 'Invalid name format' });
    if (!/^[0-9]+$/.test(phone || '')) return res.status(400).json({ message: 'Invalid phone format' });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ message: 'Order must contain items' });
    if (!Number.isFinite(Number(total))) return res.status(400).json({ message: 'Invalid total' });

    const order = { name: name.trim(), phone: phone.trim(), items, total: Number(total), createdAt: new Date() };
    await Orders.insertOne(order);
    res.json({ message: 'Order saved successfully', order });
  } catch (err) {
    console.error('POST /api/order error:', err.message);
    res.status(500).json({ message: 'Failed to save order' });
  }
});

// PUT /api/lessons
// This updates the remaining spaces for a lesson in a specific city after a booking.
app.put('/api/lessons', async (req, res) => {
  try {
    if (!Lessons) throw new Error('Database not ready');
    const { subject, city, spaces } = req.body;

    // Validation to avoid bad updates
    if (!subject || !city || spaces === undefined) {
      return res.status(400).json({ message: 'subject, city, and spaces are required' });
    }

    const newSpaces = Number(spaces);
    if (!Number.isFinite(newSpaces) || newSpaces < 0) {
      return res.status(400).json({ message: 'spaces must be a non-negative number' });
    }

    // Updates the city inside the selected lesson
    const result = await Lessons.updateOne(
      { subject, 'locations.city': city },
      { $set: { 'locations.$.spaces': newSpaces } }
    );

    if (result.matchedCount === 0) return res.status(404).json({ message: 'Lesson or city not found' });

    res.json({ ok: true, subject, city, spaces: newSpaces });
  } catch (err) {
    console.error('PUT /api/lessons error:', err.message);
    res.status(500).json({ message: 'Failed to update spaces' });
  }
});

// Start the server
// I start the server first so the health check works even if the database connection fails.
const port = process.env.PORT || 3000;
(async () => {
  try {
    app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
    await connectDB();
  } catch (err) {
    console.error('Database connection failed:', err);
    // The server stays running so I can still check /health
  }
})();

