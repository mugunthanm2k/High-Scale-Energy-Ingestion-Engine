-- =====================================================
-- High-Scale Energy Ingestion Engine - Database Schema
-- =====================================================
-- Strategy: Hot/Cold Data Architecture
-- Hot: Current status (fast reads, UPSERT operations)
-- Cold: Historical data (append-only, time-series)
-- =====================================================

-- =====================================================
-- COLD STORAGE: Historical Data (Append-Only)
-- Optimized for: Write-heavy ingestion, time-based queries
-- =====================================================

-- Meter Historical Data (Time-series, INSERT only)
CREATE TABLE IF NOT EXISTS meter_telemetry_history (
    id BIGSERIAL PRIMARY KEY,
    meter_id VARCHAR(100) NOT NULL,
    kwh_consumed_ac DECIMAL(10, 4) NOT NULL,
    voltage DECIMAL(8, 2) NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL,
    ingested_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for time-based queries (critical for analytics)
CREATE INDEX IF NOT EXISTS idx_meter_history_time 
    ON meter_telemetry_history(meter_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_meter_history_recorded 
    ON meter_telemetry_history(recorded_at DESC);

-- Vehicle Historical Data (Time-series, INSERT only)
CREATE TABLE IF NOT EXISTS vehicle_telemetry_history (
    id BIGSERIAL PRIMARY KEY,
    vehicle_id VARCHAR(100) NOT NULL,
    soc DECIMAL(5, 2) NOT NULL CHECK (soc >= 0 AND soc <= 100),
    kwh_delivered_dc DECIMAL(10, 4) NOT NULL,
    battery_temp DECIMAL(5, 2) NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL,
    ingested_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for time-based queries
CREATE INDEX IF NOT EXISTS idx_vehicle_history_time 
    ON vehicle_telemetry_history(vehicle_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_history_recorded 
    ON vehicle_telemetry_history(recorded_at DESC);

-- =====================================================
-- HOT STORAGE: Current Status (UPSERT)
-- Optimized for: Fast reads, dashboard queries
-- =====================================================

-- Meter Current Status (Latest reading per meter)
CREATE TABLE IF NOT EXISTS meter_current_status (
    meter_id VARCHAR(100) PRIMARY KEY,
    kwh_consumed_ac DECIMAL(10, 4) NOT NULL,
    voltage DECIMAL(8, 2) NOT NULL,
    last_updated TIMESTAMPTZ NOT NULL,
    ingested_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vehicle Current Status (Latest reading per vehicle)
CREATE TABLE IF NOT EXISTS vehicle_current_status (
    vehicle_id VARCHAR(100) PRIMARY KEY,
    soc DECIMAL(5, 2) NOT NULL CHECK (soc >= 0 AND soc <= 100),
    kwh_delivered_dc DECIMAL(10, 4) NOT NULL,
    battery_temp DECIMAL(5, 2) NOT NULL,
    last_updated TIMESTAMPTZ NOT NULL,
    ingested_at TIMESTAMPTZ DEFAULT NOW(),
    is_charging BOOLEAN DEFAULT FALSE
);

-- =====================================================
-- ANALYTICS OPTIMIZATION: Materialized View
-- Prevents full table scans for 24-hour analytics
-- =====================================================

-- Drop existing view if it exists
DROP MATERIALIZED VIEW IF EXISTS vehicle_24h_performance CASCADE;

-- 24-hour rolling window for analytics
CREATE MATERIALIZED VIEW vehicle_24h_performance AS
WITH time_window AS (
    SELECT NOW() - INTERVAL '24 hours' AS start_time
),
vehicle_dc_totals AS (
    SELECT 
        vehicle_id,
        SUM(kwh_delivered_dc) AS total_dc_delivered,
        AVG(battery_temp) AS avg_battery_temp,
        COUNT(*) AS reading_count,
        MIN(recorded_at) AS first_reading,
        MAX(recorded_at) AS last_reading
    FROM vehicle_telemetry_history
    CROSS JOIN time_window
    WHERE recorded_at >= time_window.start_time
    GROUP BY vehicle_id
),
meter_ac_totals AS (
    SELECT 
        meter_id,
        SUM(kwh_consumed_ac) AS total_ac_consumed,
        COUNT(*) AS reading_count
    FROM meter_telemetry_history
    CROSS JOIN time_window
    WHERE recorded_at >= time_window.start_time
    GROUP BY meter_id
)
SELECT 
    v.vehicle_id,
    v.total_dc_delivered,
    COALESCE(m.total_ac_consumed, 0) AS total_ac_consumed,
    CASE 
        WHEN COALESCE(m.total_ac_consumed, 0) > 0 
        THEN ROUND((v.total_dc_delivered / m.total_ac_consumed * 100)::numeric, 2)
        ELSE 0 
    END AS efficiency_ratio,
    v.avg_battery_temp,
    v.reading_count AS vehicle_readings,
    COALESCE(m.reading_count, 0) AS meter_readings,
    v.first_reading,
    v.last_reading,
    NOW() AS computed_at
FROM vehicle_dc_totals v
LEFT JOIN meter_ac_totals m ON v.vehicle_id = m.meter_id;

-- Index on materialized view for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_24h_perf 
    ON vehicle_24h_performance(vehicle_id);

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to refresh materialized view (run periodically via cron)
CREATE OR REPLACE FUNCTION refresh_analytics()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY vehicle_24h_performance;
END;
$$ LANGUAGE plpgsql;

-- Function to clean old historical data (retention policy)
CREATE OR REPLACE FUNCTION cleanup_old_data(retention_days INTEGER DEFAULT 90)
RETURNS TABLE(meter_deleted BIGINT, vehicle_deleted BIGINT) AS $$
DECLARE
    meter_count BIGINT;
    vehicle_count BIGINT;
BEGIN
    DELETE FROM meter_telemetry_history 
    WHERE recorded_at < NOW() - (retention_days || ' days')::INTERVAL;
    GET DIAGNOSTICS meter_count = ROW_COUNT;
    
    DELETE FROM vehicle_telemetry_history 
    WHERE recorded_at < NOW() - (retention_days || ' days')::INTERVAL;
    GET DIAGNOSTICS vehicle_count = ROW_COUNT;
    
    RETURN QUERY SELECT meter_count, vehicle_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get system statistics
CREATE OR REPLACE FUNCTION get_system_stats()
RETURNS TABLE(
    total_meters BIGINT,
    total_vehicles BIGINT,
    meter_history_count BIGINT,
    vehicle_history_count BIGINT,
    total_records BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT COUNT(DISTINCT meter_id) FROM meter_current_status),
        (SELECT COUNT(DISTINCT vehicle_id) FROM vehicle_current_status),
        (SELECT COUNT(*) FROM meter_telemetry_history),
        (SELECT COUNT(*) FROM vehicle_telemetry_history),
        (SELECT COUNT(*) FROM meter_telemetry_history) + 
        (SELECT COUNT(*) FROM vehicle_telemetry_history);
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- PERFORMANCE NOTES
-- =====================================================
-- For production with billions of rows:
-- 1. Implement time-based partitioning (monthly/daily)
-- 2. Use pg_partman for automated partition management
-- 3. Consider TimescaleDB for time-series optimization
-- 4. Set up automated VACUUM and ANALYZE jobs
-- 5. Configure appropriate autovacuum settings
-- =====================================================