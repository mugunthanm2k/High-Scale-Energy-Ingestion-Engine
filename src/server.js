const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const routes = require('./routes');
const { testConnection, closePool } = require('./config/database');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// =====================================================
// Middleware
// =====================================================

// Request logging
app.use(morgan('dev'));

// Enable CORS
app.use(cors());

// Parse JSON bodies
app.use(express.json({ limit: '10mb' }));

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// =====================================================
// Routes
// =====================================================

// API routes with /v1 prefix
app.use('/v1', routes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Energy Ingestion Engine API',
    version: '1.0.0',
    endpoints: {
      health: 'GET /v1/health',
      ingest: 'POST /v1/ingest',
      ingestBatch: 'POST /v1/ingest/batch',
      deviceStatus: 'GET /v1/ingest/status/:type/:id',
      vehiclePerformance: 'GET /v1/analytics/performance/:vehicleId',
      systemStats: 'GET /v1/analytics/stats',
      efficiencyAlerts: 'GET /v1/analytics/alerts',
      refreshAnalytics: 'POST /v1/analytics/refresh'
    },
    documentation: 'See README.md for detailed API documentation'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.path
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
});

// =====================================================
// Server Startup
// =====================================================

async function startServer() {
  try {
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.error('❌ Failed to connect to database');
      process.exit(1);
    }

    // Start server
    app.listen(PORT, () => {
      console.log('');
      console.log('═══════════════════════════════════════════════════');
      console.log('🚀 Energy Ingestion Engine Started');
      console.log('═══════════════════════════════════════════════════');
      console.log(`📡 Server running on: http://localhost:${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('');
      console.log('📋 Available Endpoints:');
      console.log(`   Health Check:       GET  http://localhost:${PORT}/v1/health`);
      console.log(`   Ingest Telemetry:   POST http://localhost:${PORT}/v1/ingest`);
      console.log(`   Batch Ingest:       POST http://localhost:${PORT}/v1/ingest/batch`);
      console.log(`   Vehicle Performance: GET  http://localhost:${PORT}/v1/analytics/performance/:vehicleId`);
      console.log(`   System Stats:       GET  http://localhost:${PORT}/v1/analytics/stats`);
      console.log('═══════════════════════════════════════════════════');
      console.log('');
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await closePool();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await closePool();
  process.exit(0);
});

// Start the server
startServer();

module.exports = app;