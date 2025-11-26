#!/usr/bin/env node
/**
 * Export ALL MySQL tables in the given schema to CSV (no column missing).
 * - One CSV per table under exports/all/
 * - Headers include every column in ordinal order
 * - No schema transformation; values are exported as-is (dates as strings)
 *
 * Env vars (optional): MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DB
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const cfg = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: parseInt(process.env.MYSQL_PORT || '3306', 10),
  user: process.env.MYSQL_USER || 'auditor',
  password: process.env.MYSQL_PASSWORD || 'StrongPwd!123',
  database: process.env.MYSQL_DB || 'taoist',
  // Export values as strings to avoid implicit timezone changes on Date
  dateStrings: true,
  supportBigNumbers: true,
  bigNumberStrings: true,
};

function log(...args) { console.log('[export-all]', ...args); }
function err(...args) { console.error('[export-all:ERR]', ...args); }

function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  if (s.includes(',')) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCSV(headers, rows) {
  const head = headers.join(',');
  const body = rows.map(r => headers.map(h => csvEscape(r[h])).join(',')).join('\n');
  return head + '\n' + body + (body ? '\n' : '');
}

async function q(conn, sql, params = []) { const [rows] = await conn.query(sql, params); return rows; }

async function listTables(conn, schema) {
  const rows = await q(conn, `SELECT table_name AS t FROM information_schema.tables WHERE table_schema=? AND table_type='BASE TABLE' ORDER BY table_name`, [schema]);
  return rows.map(r => r.t);
}

async function getColumnsOrdered(conn, schema, table) {
  const rows = await q(conn, `SELECT column_name AS c FROM information_schema.columns WHERE table_schema=? AND table_name=? ORDER BY ordinal_position`, [schema, table]);
  return rows.map(r => r.c);
}

async function exportTable(conn, schema, table, outDir) {
  const cols = await getColumnsOrdered(conn, schema, table);
  const backticked = cols.map(c => `\`${c}\``).join(', ');
  const sql = `SELECT ${backticked} FROM \`${table}\``;
  log(`export ${table} ...`);
  const rows = await q(conn, sql);
  const csv = toCSV(cols, rows);
  const safeName = table.replace(/^_+/, '');
  const file = path.join(outDir, `${safeName}.csv`);
  fs.writeFileSync(file, csv);
  if (safeName !== table) log(`renamed output file: ${table}.csv -> ${safeName}.csv`);
  log(`written ${file} rows=${rows.length} cols=${cols.length}`);
}

async function run() {
  log('connecting...', cfg.user + '@' + cfg.host + ':' + cfg.port + '/' + cfg.database);
  const conn = await mysql.createConnection(cfg);
  try {
    const outDir = path.join(process.cwd(), 'exports', 'all');
    ensureDir(outDir);

    const tables = await listTables(conn, cfg.database);
    log('tables:', tables.join(', '));

    for (const t of tables) {
      await exportTable(conn, cfg.database, t, outDir);
    }
    log('DONE. All tables exported to exports/all/*.csv');
  } finally {
    await conn.end();
  }
}

run().catch(e => { err(e.stack || e.message || e); process.exit(1); });

