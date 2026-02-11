const meterService = require('../services/meterService');
const vehicleService = require('../services/vehicleService');

/**
 * Ingestion Controller
 * Handles polymorphic telemetry ingestion
 */
class IngestionController {
  
  /**
   * POST /v1/ingest
   * Polymorphic endpoint - automatically detects meter vs vehicle telemetry
   */
  async ingestTelemetry(req, res) {
    try {
      const telemetryData = req.body;

      if (!telemetryData || typeof telemetryData !== 'object') {
        return res.status(400).json({
          success: false,
          error: 'Invalid request body: expected JSON object'
        });
      }

      // Identify telemetry type
      const telemetryType = identifyTelemetryType(telemetryData);
      
      let result;
      if (telemetryType === 'meter') {
        result = await meterService.ingest(telemetryData);
      } else if (telemetryType === 'vehicle') {
        result = await vehicleService.ingest(telemetryData);
      } else {
        return res.status(400).json({
          success: false,
          error: 'Unknown telemetry type. Expected meter or vehicle format.'
        });
      }

      return res.status(201).json({
        success: true,
        message: 'Telemetry ingested successfully',
        data: result
      });

    } catch (error) {
      console.error('Ingestion error:', error);
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /v1/ingest/batch
   * Batch ingestion for high-throughput scenarios
   */
  async ingestBatch(req, res) {
    try {
      const batchData = req.body;

      if (!Array.isArray(batchData) || batchData.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Invalid batch data: expected non-empty array'
        });
      }

      // Separate by type
      const meterBatch = [];
      const vehicleBatch = [];

      for (const data of batchData) {
        const type = identifyTelemetryType(data);
        if (type === 'meter') {
          meterBatch.push(data);
        } else if (type === 'vehicle') {
          vehicleBatch.push(data);
        }
      }

      // Process in parallel
      const [meterResult, vehicleResult] = await Promise.allSettled([
        meterBatch.length > 0 ? meterService.ingestBatch(meterBatch) : Promise.resolve({ count: 0 }),
        vehicleBatch.length > 0 ? vehicleService.ingestBatch(vehicleBatch) : Promise.resolve({ count: 0 })
      ]);

      const totalProcessed = 
        (meterResult.status === 'fulfilled' ? meterResult.value.count : 0) +
        (vehicleResult.status === 'fulfilled' ? vehicleResult.value.count : 0);

      return res.status(201).json({
        success: true,
        message: `Processed ${totalProcessed} records`,
        data: {
          total: totalProcessed,
          meters: meterResult.status === 'fulfilled' ? meterResult.value.count : 0,
          vehicles: vehicleResult.status === 'fulfilled' ? vehicleResult.value.count : 0,
          errors: [
            ...(meterResult.status === 'rejected' ? [meterResult.reason.message] : []),
            ...(vehicleResult.status === 'rejected' ? [vehicleResult.reason.message] : [])
          ]
        }
      });

    } catch (error) {
      console.error('Batch ingestion error:', error);
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /v1/ingest/status/:type/:id
   * Get current status of a device
   */
  async getStatus(req, res) {
    try {
      const { type, id } = req.params;

      let status;
      if (type === 'meter') {
        status = await meterService.getCurrentStatus(id);
      } else if (type === 'vehicle') {
        status = await vehicleService.getCurrentStatus(id);
      } else {
        return res.status(400).json({
          success: false,
          error: 'Invalid type: must be "meter" or "vehicle"'
        });
      }

      if (!status) {
        return res.status(404).json({
          success: false,
          error: `No data found for ${type} ${id}`
        });
      }

      return res.json({
        success: true,
        data: status
      });

    } catch (error) {
      console.error('Get status error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

/**
 * Identify telemetry type based on payload structure
 * Meter: { meterId, kwhConsumedAc, voltage, timestamp }
 * Vehicle: { vehicleId, soc, kwhDeliveredDc, batteryTemp, timestamp }
 */
function identifyTelemetryType(data) {
  // Check for meter fields
  if (data.meterId !== undefined && 
      data.kwhConsumedAc !== undefined && 
      data.voltage !== undefined) {
    return 'meter';
  }
  
  // Check for vehicle fields
  if (data.vehicleId !== undefined && 
      data.soc !== undefined && 
      data.kwhDeliveredDc !== undefined) {
    return 'vehicle';
  }
  
  return 'unknown';
}

module.exports = new IngestionController();