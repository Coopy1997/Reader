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
  }
}

let pool

async function connectDB() {
  if (pool) return pool
  pool = await sql.connect(config)
  return pool
}

module.exports = { sql, connectDB }