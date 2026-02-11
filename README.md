# ⚡ High-Scale Energy Ingestion Engine

A **production-ready, high-throughput telemetry ingestion system** designed for **Smart Meters and Electric Vehicles (EVs)**.  

Built with a scalable **Hot/Cold storage architecture**, optimized for **time-series energy data**, and engineered for real-time analytics and performance monitoring.

🔗 **GitHub Repository:** [(https://github.com/mugunthanm2k/High-Scale-Energy-Ingestion-Engine.git)](#)  

---

## 🚀 Features

- Polymorphic Ingestion: Single endpoint handles both Meter and Vehicle telemetry streams

- Hot/Cold Data Architecture: Optimized storage strategy for write-heavy ingestion and read-heavy analytics

- Real-time Analytics: 24-hour performance summaries without full table scans

- High Throughput: Batch processing capable of handling 10,000+ devices

- Efficiency Monitoring: Automatic detection of hardware faults via DC/AC efficiency ratios

- Production Ready: Includes connection pooling, transactions, and graceful shutdown

---

## 🏗 Architecture Overview
```
Devices (10,000+) → Ingestion API → PostgreSQL Database → Analytics API → Dashboard
          ↓                   ↓              ↓                  ↓
     Every 60s        Polymorphic      Hot/Cold Storage    Materialized Views
                      (Meter/Vehicle)    + Indexing        + Fast Queries
```
---
## Database Schema Strategy

### 🔥 Hot Storage (Current Status)

- Tables: meter_current_status, vehicle_current_status

- Strategy: UPSERT operations (atomic updates)

- Purpose: Fast dashboard queries, real-time status monitoring

- Optimization: Primary key lookups, minimal row scanning

### ❄️ Cold Storage (Historical Data)

- Tables: meter_telemetry_history, vehicle_telemetry_history

- Strategy: Append-only INSERT operations

- Purpose: Audit trail, long-term reporting, time-series analysis

- Optimization: Time-based indexes for efficient range queries

### 📊 Analytics Layer

- Materialized View: vehicle_24h_performance

- Strategy: Pre-computed aggregates refreshed periodically

- Purpose: Avoid full table scans for analytical queries

- Performance: Sub-second response times even with billions of rows

---

## 🛠 Tech Stack

| Layer        | Technology |
|-------------|------------|
| Backend     | Node.js, Express.js |
| Database    | PostgreSQL |
| Architecture| Hot/Cold Storage Model |
| Analytics   | Materialized Views |
| API         | RESTful Design |

---

## ⚙️ Installation

### 1️⃣ Clone the Repository
```bash
git clone (https://github.com/mugunthanm2k/High-Scale-Energy-Ingestion-Engine.git)
cd high-scale-energy-ingestion-engine
```
2️⃣ Install Dependencies
```bash
npm install
```
3️⃣ Setup PostgreSQL Database
```
- Create a new database

- Update .env file with credentials
```
4️⃣ Start the Server
```
npm start
```
5️⃣ Server runs on:
```
http://localhost:5000
```

---

🔐 Environment Variables

Create a .env file in the root directory:
```
PORT=5000
DB_HOST=localhost
DB_PORT=5432
DB_USER=your_username
DB_PASSWORD=your_password
DB_NAME=energy_engine
```

---

## 🔌 API Endpoints

📥 Ingestion Endpoints
```
POST /v1/ingest - Polymorphic telemetry ingestion (auto-detects meter/vehicle)

POST /v1/ingest/batch - Batch ingestion for high-throughput scenarios

GET /v1/ingest/status/:type/:id - Get current device status
```

📊 Analytics Endpoints
```
GET /v1/analytics/performance/:vehicleId - 24-hour performance summary

GET /v1/analytics/stats - System-wide statistics

GET /v1/analytics/alerts - Efficiency alerts (below 85% threshold)

POST /v1/analytics/refresh - Manually refresh materialized view
```
🩺 Health & Monitoring
```
GET /v1/health - Service health check

GET / - API documentation and available endpoints
```
---

📁 Folder Structure
```text
high-scale-energy-ingestion-engine/
│
├── src/
│   ├── controllers/
│   ├── routes/
│   ├── services/
│   ├── config/
│   └── server.js   
│── database/
├── scripts/
├── .env
├── package.json
└── README.md
```
---

🔮 Future Improvements
- 🚀 Kafka-based ingestion for extreme scale

- 📊 Real-time dashboard (React + WebSockets)

- ☁️ Cloud-native deployment (Docker + Kubernetes)

- 📈 Advanced anomaly detection using ML

- 🔄 Automatic Materialized View refresh scheduling

-📦 CI/CD pipeline integration

---

🤝 Contributing
Contributions are welcome!

1. Fork the repository

2. Create a new branch (feature/your-feature)

3. Commit your changes

4. Push to your branch

5. Open a Pull Request
 
---
