const { query } = require('../config/database');

/**
 * Analytics Service
 * Provides fast analytical insights without full table scans
 * Uses materialized views and indexed queries
 */
class AnalyticsService {
  
  /**
   * Get 24-hour performance summary for a vehicle
   * Uses materialized view to avoid full table scan
   * 
   * Returns:
   * - Total energy consumed (AC) from meter
   * - Total energy delivered (DC) to vehicle
   * - Efficiency ratio (DC/AC %)
   * - Average battery temperature
   */
  async getVehiclePerformance(vehicleId) {
    // Try materialized view first (fastest - no table scan)
    const mvResult = await query(
      `SELECT 
        vehicle_id,
        total_dc_delivered,
        total_ac_consumed,
        efficiency_ratio,
        avg_battery_temp,
        vehicle_readings,
        meter_readings,
        first_reading,
        last_reading,
        computed_at
       FROM vehicle_24h_performance 
       WHERE vehicle_id = $1`,
      [vehicleId]
    );

    if (mvResult.rows.length > 0) {
      return this.formatPerformanceData(mvResult.rows[0]);
    }

    // Fallback: Compute on-demand with indexed queries (still fast)
    const result = await this.computePerformanceOnDemand(vehicleId);
    return result;
  }

  /**
   * Compute performance on-demand using indexed queries
   * Used when materialized view hasn't been refreshed
   */
  async computePerformanceOnDemand(vehicleId) {
    const timeWindow = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Get vehicle DC data (uses index: idx_vehicle_history_time)
    const vehicleResult = await query(
      `SELECT 
        SUM(kwh_delivered_dc) as total_dc_delivered,
        AVG(battery_temp) as avg_battery_temp,
        COUNT(*) as reading_count,
        MIN(recorded_at) as first_reading,
        MAX(recorded_at) as last_reading
       FROM vehicle_telemetry_history 
       WHERE vehicle_id = $1 
       AND recorded_at >= $2`,
      [vehicleId, timeWindow]
    );

    // Get meter AC data (uses index: idx_meter_history_time)
    // Assumes meter_id matches vehicle_id for correlation
    const meterResult = await query(
      `SELECT 
        SUM(kwh_consumed_ac) as total_ac_consumed,
        COUNT(*) as reading_count
       FROM meter_telemetry_history 
       WHERE meter_id = $1 
       AND recorded_at >= $2`,
      [vehicleId, timeWindow]
    );

    const vehicleData = vehicleResult.rows[0];
    const meterData = meterResult.rows[0];

    const totalDc = parseFloat(vehicleData.total_dc_delivered) || 0;
    const totalAc = parseFloat(meterData.total_ac_consumed) || 0;
    const efficiencyRatio = totalAc > 0 ? (totalDc / totalAc * 100).toFixed(2) : 0;

    return this.formatPerformanceData({
      vehicle_id: vehicleId,
      total_dc_delivered: totalDc,
      total_ac_consumed: totalAc,
      efficiency_ratio: efficiencyRatio,
      avg_battery_temp: parseFloat(vehicleData.avg_battery_temp) || 0,
      vehicle_readings: parseInt(vehicleData.reading_count) || 0,
      meter_readings: parseInt(meterData.reading_count) || 0,
      first_reading: vehicleData.first_reading,
      last_reading: vehicleData.last_reading,
      computed_at: new Date()
    });
  }

  /**
   * Refresh materialized view for all vehicles
   * Should be called periodically (e.g., every 5-10 minutes)
   */
  async refreshMaterializedView() {
    try {
      const start = Date.now();
      await query('SELECT refresh_analytics()');
      const duration = Date.now() - start;
      
      console.log(`✅ Materialized view refreshed in ${duration}ms`);
      return { success: true, duration };
    } catch (error) {
      console.error('❌ Failed to refresh materialized view:', error.message);
      throw error;
    }
  }

  /**
   * Get system-wide statistics
   */
  async getSystemStats() {
    const result = await query('SELECT * FROM get_system_stats()');
    const stats = result.rows[0];
    
    return {
      totalMeters: parseInt(stats.total_meters),
      totalVehicles: parseInt(stats.total_vehicles),
      meterHistoryCount: parseInt(stats.meter_history_count),
      vehicleHistoryCount: parseInt(stats.vehicle_history_count),
      totalRecords: parseInt(stats.total_records),
      estimatedDailyRecords: (parseInt(stats.total_meters) + parseInt(stats.total_vehicles)) * 1440 // 60s intervals for 24h
    };
  }

  /**
   * Get efficiency alerts for vehicles below threshold
   */
  async getEfficiencyAlerts(threshold = 85) {
    const result = await query(
      `SELECT 
        vehicle_id,
        efficiency_ratio,
        total_ac_consumed,
        total_dc_delivered,
        avg_battery_temp
       FROM vehicle_24h_performance 
       WHERE efficiency_ratio > 0 
       AND efficiency_ratio < $1
       ORDER BY efficiency_ratio ASC`,
      [threshold]
    );

    return result.rows.map(row => ({
      vehicleId: row.vehicle_id,
      efficiencyRatio: parseFloat(row.efficiency_ratio),
      totalAcConsumed: parseFloat(row.total_ac_consumed),
      totalDcDelivered: parseFloat(row.total_dc_delivered),
      avgBatteryTemp: parseFloat(row.avg_battery_temp),
      alert: 'Low efficiency - possible hardware fault or energy leakage'
    }));
  }

  /**
   * Format performance data for API response
   */
  formatPerformanceData(data) {
    return {
      vehicleId: data.vehicle_id,
      performance: {
        totalEnergyConsumedAc: parseFloat(data.total_ac_consumed) || 0,
        totalEnergyDeliveredDc: parseFloat(data.total_dc_delivered) || 0,
        efficiencyRatio: parseFloat(data.efficiency_ratio) || 0,
        averageBatteryTemp: parseFloat(data.avg_battery_temp) || 0
      },
      metadata: {
        vehicleReadings: parseInt(data.vehicle_readings) || 0,
        meterReadings: parseInt(data.meter_readings) || 0,
        firstReading: data.first_reading,
        lastReading: data.last_reading,
        computedAt: data.computed_at,
        timeWindow: '24 hours'
      },
      healthCheck: {
        status: parseFloat(data.efficiency_ratio) >= 85 ? 'healthy' : 'warning',
        message: parseFloat(data.efficiency_ratio) < 85 
          ? 'Efficiency below 85% - investigate for hardware fault or energy leakage'
          : 'Normal operation'
      }
    };
  }
}

module.exports = new AnalyticsService();