const express = require('express');
const ingestionController = require('../controllers/ingestionController');
const analyticsController = require('../controllers/analyticsController');

const router = express.Router();

// =====================================================
// Ingestion Routes
// =====================================================

// Polymorphic telemetry ingestion
router.post('/ingest', (req, res) => ingestionController.ingestTelemetry(req, res));

// Batch telemetry ingestion
router.post('/ingest/batch', (req, res) => ingestionController.ingestBatch(req, res));

// Get current status of a device
router.get('/ingest/status/:type/:id', (req, res) => ingestionController.getStatus(req, res));

// =====================================================
// Analytics Routes
// =====================================================

// Get 24-hour performance summary for a vehicle
router.get('/analytics/performance/:vehicleId', (req, res) => analyticsController.getVehiclePerformance(req, res));

// Refresh materialized view
router.post('/analytics/refresh', (req, res) => analyticsController.refreshAnalytics(req, res));

// Get system-wide statistics
router.get('/analytics/stats', (req, res) => analyticsController.getSystemStats(req, res));

// Get efficiency alerts
router.get('/analytics/alerts', (req, res) => analyticsController.getEfficiencyAlerts(req, res));

// =====================================================
// Health Check Route
// =====================================================

router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Energy Ingestion Engine is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

module.exports = router;