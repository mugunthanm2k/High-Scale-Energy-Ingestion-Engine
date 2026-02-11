const { query, transaction } = require('../config/database');

/**
 * Vehicle Service
 * Handles EV telemetry ingestion with Hot/Cold storage strategy
 */
class VehicleService {
  
  /**
   * Ingest single vehicle telemetry reading
   * Strategy: INSERT to history (cold) + UPSERT to current status (hot)
   */
  async ingest(vehicleData) {
    const { vehicleId, soc, kwhDeliveredDc, batteryTemp, timestamp } = vehicleData;

    // Validate data
    this.validateVehicleData(vehicleData);

    return await transaction(async (client) => {
      // 1. COLD STORAGE: Append to history (INSERT only - audit trail)
      await client.query(
        `INSERT INTO vehicle_telemetry_history 
         (vehicle_id, soc, kwh_delivered_dc, battery_temp, recorded_at) 
         VALUES ($1, $2, $3, $4, $5)`,
        [vehicleId, soc, kwhDeliveredDc, batteryTemp, timestamp]
      );

      // Determine if vehicle is charging (SoC increasing)
      const prevStatus = await client.query(
        'SELECT soc FROM vehicle_current_status WHERE vehicle_id = $1',
        [vehicleId]
      );
      
      const isCharging = prevStatus.rows.length > 0 
        ? soc > prevStatus.rows[0].soc 
        : false;

      // 2. HOT STORAGE: Update current status (UPSERT - fast dashboard reads)
      await client.query(
        `INSERT INTO vehicle_current_status 
         (vehicle_id, soc, kwh_delivered_dc, battery_temp, last_updated, is_charging) 
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (vehicle_id) 
         DO UPDATE SET 
           soc = EXCLUDED.soc,
           kwh_delivered_dc = EXCLUDED.kwh_delivered_dc,
           battery_temp = EXCLUDED.battery_temp,
           last_updated = EXCLUDED.last_updated,
           is_charging = EXCLUDED.is_charging,
           ingested_at = NOW()`,
        [vehicleId, soc, kwhDeliveredDc, batteryTemp, timestamp, isCharging]
      );

      return {
        vehicleId,
        type: 'vehicle',
        stored: true,
        timestamp,
        isCharging
      };
    });
  }

  /**
   * Batch ingest for high-throughput scenarios
   * Optimized for 10,000+ devices sending data every 60 seconds
   */
  async ingestBatch(vehicleBatch) {
    if (!vehicleBatch || vehicleBatch.length === 0) {
      return { count: 0 };
    }

    return await transaction(async (client) => {
      // Batch insert for history (cold storage)
      const historyValues = [];
      const historyParams = [];
      
      vehicleBatch.forEach((vehicle, index) => {
        const base = index * 5;
        historyValues.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`);
        historyParams.push(
          vehicle.vehicleId,
          vehicle.soc,
          vehicle.kwhDeliveredDc,
          vehicle.batteryTemp,
          vehicle.timestamp
        );
      });

      await client.query(
        `INSERT INTO vehicle_telemetry_history 
         (vehicle_id, soc, kwh_delivered_dc, battery_temp, recorded_at) 
         VALUES ${historyValues.join(', ')}`,
        historyParams
      );

      // Batch upsert for current status (hot storage)
      for (const vehicle of vehicleBatch) {
        await client.query(
          `INSERT INTO vehicle_current_status 
           (vehicle_id, soc, kwh_delivered_dc, battery_temp, last_updated, is_charging) 
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (vehicle_id) 
           DO UPDATE SET 
             soc = EXCLUDED.soc,
             kwh_delivered_dc = EXCLUDED.kwh_delivered_dc,
             battery_temp = EXCLUDED.battery_temp,
             last_updated = EXCLUDED.last_updated,
             is_charging = EXCLUDED.is_charging,
             ingested_at = NOW()`,
          [vehicle.vehicleId, vehicle.soc, vehicle.kwhDeliveredDc, 
           vehicle.batteryTemp, vehicle.timestamp, false]
        );
      }

      return { count: vehicleBatch.length };
    });
  }

  /**
   * Get current status of a vehicle (from hot storage - no table scan)
   */
  async getCurrentStatus(vehicleId) {
    const result = await query(
      'SELECT * FROM vehicle_current_status WHERE vehicle_id = $1',
      [vehicleId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get historical data for a vehicle within time range
   */
  async getHistory(vehicleId, startTime, endTime) {
    const result = await query(
      `SELECT * FROM vehicle_telemetry_history 
       WHERE vehicle_id = $1 
       AND recorded_at BETWEEN $2 AND $3
       ORDER BY recorded_at DESC`,
      [vehicleId, startTime, endTime]
    );
    return result.rows;
  }

  /**
   * Validate vehicle telemetry data
   */
  validateVehicleData(data) {
    const { vehicleId, soc, kwhDeliveredDc, batteryTemp, timestamp } = data;

    if (!vehicleId || typeof vehicleId !== 'string') {
      throw new Error('Invalid vehicleId: must be a non-empty string');
    }

    if (typeof soc !== 'number' || soc < 0 || soc > 100) {
      throw new Error('Invalid soc: must be a number between 0 and 100');
    }

    if (typeof kwhDeliveredDc !== 'number' || kwhDeliveredDc < 0) {
      throw new Error('Invalid kwhDeliveredDc: must be a positive number');
    }

    if (typeof batteryTemp !== 'number') {
      throw new Error('Invalid batteryTemp: must be a number');
    }

    if (!timestamp) {
      throw new Error('Invalid timestamp: timestamp is required');
    }

    const parsedDate = new Date(timestamp);
    if (isNaN(parsedDate.getTime())) {
      throw new Error('Invalid timestamp: must be a valid ISO 8601 date string');
    }
  }
}

module.exports = new VehicleService();