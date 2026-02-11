const analyticsService = require('../services/analyticsService');

/**
 * Analytics Controller
 * Provides fast analytical insights without full table scans
 */
class AnalyticsController {
  
  /**
   * GET /v1/analytics/performance/:vehicleId
   * Get 24-hour performance summary for a specific vehicle
   */
  async getVehiclePerformance(req, res) {
    try {
      const { vehicleId } = req.params;

      if (!vehicleId) {
        return res.status(400).json({
          success: false,
          error: 'vehicleId is required'
        });
      }

      const performance = await analyticsService.getVehiclePerformance(vehicleId);

      return res.json({
        success: true,
        data: performance
      });

    } catch (error) {
      console.error('Get vehicle performance error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /v1/analytics/refresh
   * Manually refresh the materialized view
   */
  async refreshAnalytics(req, res) {
    try {
      const result = await analyticsService.refreshMaterializedView();

      return res.json({
        success: true,
        message: 'Analytics refreshed successfully',
        data: result
      });

    } catch (error) {
      console.error('Refresh analytics error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /v1/analytics/stats
   * Get system-wide statistics
   */
  async getSystemStats(req, res) {
    try {
      const stats = await analyticsService.getSystemStats();

      return res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      console.error('Get system stats error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /v1/analytics/alerts
   * Get efficiency alerts for vehicles below threshold
   */
  async getEfficiencyAlerts(req, res) {
    try {
      const threshold = parseFloat(req.query.threshold) || 85;

      const alerts = await analyticsService.getEfficiencyAlerts(threshold);

      return res.json({
        success: true,
        data: {
          threshold,
          count: alerts.length,
          alerts
        }
      });

    } catch (error) {
      console.error('Get efficiency alerts error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

module.exports = new AnalyticsController();