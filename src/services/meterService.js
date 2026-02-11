const { query, transaction } = require('../config/database');

/**
 * Meter Service
 * Handles Smart Meter telemetry ingestion with Hot/Cold storage strategy
 */
class MeterService {
  
  /**
   * Ingest single meter telemetry reading
   * Strategy: INSERT to history (cold) + UPSERT to current status (hot)
   */
  async ingest(meterData) {
    const { meterId, kwhConsumedAc, voltage, timestamp } = meterData;

    // Validate data
    this.validateMeterData(meterData);

    return await transaction(async (client) => {
      // 1. COLD STORAGE: Append to history (INSERT only - audit trail)
      await client.query(
        `INSERT INTO meter_telemetry_history 
         (meter_id, kwh_consumed_ac, voltage, recorded_at) 
         VALUES ($1, $2, $3, $4)`,
        [meterId, kwhConsumedAc, voltage, timestamp]
      );

      // 2. HOT STORAGE: Update current status (UPSERT - fast dashboard reads)
      await client.query(
        `INSERT INTO meter_current_status 
         (meter_id, kwh_consumed_ac, voltage, last_updated) 
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (meter_id) 
         DO UPDATE SET 
           kwh_consumed_ac = EXCLUDED.kwh_consumed_ac,
           voltage = EXCLUDED.voltage,
           last_updated = EXCLUDED.last_updated,
           ingested_at = NOW()`,
        [meterId, kwhConsumedAc, voltage, timestamp]
      );

      return {
        meterId,
        type: 'meter',
        stored: true,
        timestamp
      };
    });
  }

  /**
   * Batch ingest for high-throughput scenarios
   * Optimized for 10,000+ devices sending data every 60 seconds
   */
  async ingestBatch(meterBatch) {
    if (!meterBatch || meterBatch.length === 0) {
      return { count: 0 };
    }

    return await transaction(async (client) => {
      // Batch insert for history (cold storage)
      const historyValues = [];
      const historyParams = [];
      
      meterBatch.forEach((meter, index) => {
        const base = index * 4;
        historyValues.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
        historyParams.push(
          meter.meterId,
          meter.kwhConsumedAc,
          meter.voltage,
          meter.timestamp
        );
      });

      await client.query(
        `INSERT INTO meter_telemetry_history 
         (meter_id, kwh_consumed_ac, voltage, recorded_at) 
         VALUES ${historyValues.join(', ')}`,
        historyParams
      );

      // Batch upsert for current status (hot storage)
      for (const meter of meterBatch) {
        await client.query(
          `INSERT INTO meter_current_status 
           (meter_id, kwh_consumed_ac, voltage, last_updated) 
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (meter_id) 
           DO UPDATE SET 
             kwh_consumed_ac = EXCLUDED.kwh_consumed_ac,
             voltage = EXCLUDED.voltage,
             last_updated = EXCLUDED.last_updated,
             ingested_at = NOW()`,
          [meter.meterId, meter.kwhConsumedAc, meter.voltage, meter.timestamp]
        );
      }

      return { count: meterBatch.length };
    });
  }

  /**
   * Get current status of a meter (from hot storage - no table scan)
   */
  async getCurrentStatus(meterId) {
    const result = await query(
      'SELECT * FROM meter_current_status WHERE meter_id = $1',
      [meterId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get historical data for a meter within time range
   */
  async getHistory(meterId, startTime, endTime) {
    const result = await query(
      `SELECT * FROM meter_telemetry_history 
       WHERE meter_id = $1 
       AND recorded_at BETWEEN $2 AND $3
       ORDER BY recorded_at DESC`,
      [meterId, startTime, endTime]
    );
    return result.rows;
  }

  /**
   * Validate meter telemetry data
   */
  validateMeterData(data) {
    const { meterId, kwhConsumedAc, voltage, timestamp } = data;

    if (!meterId || typeof meterId !== 'string') {
      throw new Error('Invalid meterId: must be a non-empty string');
    }

    if (typeof kwhConsumedAc !== 'number' || kwhConsumedAc < 0) {
      throw new Error('Invalid kwhConsumedAc: must be a positive number');
    }

    if (typeof voltage !== 'number' || voltage < 0) {
      throw new Error('Invalid voltage: must be a positive number');
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

module.exports = new MeterService();