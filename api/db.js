const sql = require("mssql")
require("dotenv").config()

const config = {
  server: process.env.SQL_SERVER,
  database: process.env.SQL_DATABASE,
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: false
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  },
  connectionTimeout: 30000,
  requestTimeout: 30000
}

let pool = null

async function connectDB() {
  try {
    if (pool) {
      return pool
    }

    pool = await sql.connect(config)
    console.log("Connected to Azure SQL Database")
    return pool
  } catch (err) {
    console.error("Database connection failed:", err)
    throw err
  }
}

module.exports = {
  connectDB,
  sql
}