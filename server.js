const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const API_KEY = 'asat_816ffe314a2a477f92d38d5b15ba3445';
const ALLOWED_ORIGIN = 'http://127.0.0.1:5500';

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, as-api-key');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// /api/couriers endpoint
app.get('/api/couriers', async (req, res) => {
  try {
    const response = await axios.get('https://api.aftership.com/tracking/2025-07/couriers', {
      headers: { 'as-api-key': API_KEY }
    });
    console.log(`[${new Date().toISOString()}] Successfully fetched couriers from AfterShip API`);
    res.json(response.data);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error fetching couriers from AfterShip API:`, error.message);
    res.status(500).json({ error: 'Failed to fetch couriers' });
  }
});

// /api/trackings POST endpoint
app.post('/api/trackings', async (req, res) => {
  try {
    const response = await axios.post('https://api.aftership.com/tracking/2025-07/trackings', req.body, {
      headers: {
        'as-api-key': API_KEY,
        'Content-Type': 'application/json'
      }
    });
    console.log(`[${new Date().toISOString()}] Successfully created tracking with AfterShip API`);
    res.json(response.data);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error creating tracking with AfterShip API:`, error.message);
    res.status(error.response?.status || 500).json({ error: 'Failed to create tracking', details: error.message });
  }
});

// New /api/trackings GET endpoint for checking tracking status
app.get('/api/trackings', async (req, res) => {
  try {
    const { tracking_numbers, slug } = req.query;
    if (!tracking_numbers || !slug) {
      return res.status(400).json({ error: 'Missing tracking_numbers or slug' });
    }
    const response = await axios.get(`https://api.aftership.com/tracking/2025-07/trackings?tracking_numbers=${tracking_numbers}&slug=${slug}`, {
      headers: {
        'as-api-key': API_KEY
      }
    });
    console.log(`[${new Date().toISOString()}] Successfully fetched tracking status for ${tracking_numbers}`);
    res.json(response.data);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error fetching tracking status:`, error.message);
    res.status(error.response?.status || 500).json({ error: 'Failed to fetch tracking status', details: error.message });
  }
});

// New /api/trackings/:trackingId PUT endpoint for updating tracking info
app.put('/api/trackings/:trackingId', async (req, res) => {
  try {
    const { trackingId } = req.params;
    const response = await axios.put(`https://api.aftership.com/tracking/2025-07/trackings/${trackingId}`, req.body, {
      headers: {
        'as-api-key': API_KEY,
        'Content-Type': 'application/json'
      }
    });
    console.log(`[${new Date().toISOString()}] Successfully updated tracking info for ${trackingId}`);
    res.json(response.data);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error updating tracking info:`, error.message);
    res.status(error.response?.status || 500).json({ error: 'Failed to update tracking info', details: error.message });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Proxy server running at http://localhost:${PORT}`);
});