#!/usr/bin/env node
/**
 * Export MySQL data (user_points and points_ledger) to CSV for WeChat Cloud Database import
 * - Connects read-only using credentials from env (with safe defaults)
 * - Auto-detects table names/columns
 * - JOINs numeric user_id to users.openid
 * - Outputs CSV files under exports/
 *
 * Env vars (optional):
 *   MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DB
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
};

function log(...args) { console.log('[export]', ...args); }
function err(...args) { console.error('[export:ERR]', ...args); }

function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
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

async function q(conn, sql, params = []) {
  const [rows] = await conn.query(sql, params);
  return rows;
}

async function getTablesWithColumn(conn, schema, col) {
  const rows = await q(conn, `SELECT table_name AS t FROM information_schema.columns WHERE table_schema=? AND column_name=?`, [schema, col]);
  return rows.map(r => r.t);
}

async function getColumns(conn, schema, table) {
  const rows = await q(conn, `SELECT column_name AS c, data_type AS t FROM information_schema.columns WHERE table_schema=? AND table_name=?`, [schema, table]);
  return rows.map(r => r.c.toLowerCase());
}

async function getPrimaryKey(conn, schema, table) {
  const rows = await q(conn, `
    SELECT kcu.column_name AS c
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema=? AND tc.table_name=? AND tc.constraint_type='PRIMARY KEY'
    ORDER BY kcu.ordinal_position
    LIMIT 1
  `, [schema, table]);
  if (rows.length) return rows[0].c.toLowerCase();
  const cols = await getColumns(conn, schema, table);
  if (cols.includes('id')) return 'id';
  if (cols.includes('user_id')) return 'user_id';
  if (cols.includes('uid')) return 'uid';
  return cols[0];
}

function pickFirstExisting(cols, candidates) {
  const set = new Set(cols.map(c => c.toLowerCase()));
  for (const c of candidates) if (set.has(c.toLowerCase())) return c;
  return null;
}

async function guessUsersTable(conn, schema) {
  const tables = await getTablesWithColumn(conn, schema, 'openid');
  if (!tables.length) throw new Error('未找到包含 openid 列的用户表');
  const prefer = ['users', 'user', 't_user', 'member', 'members', 'account', 'accounts'];
  tables.sort((a, b) => (prefer.indexOf(a) + 999) - (prefer.indexOf(b) + 999));
  const t = tables.find(x => /user|member|account/i.test(x)) || tables[0];
  const cols = await getColumns(conn, schema, t);
  const idCol = await getPrimaryKey(conn, schema, t);
  return { table: t, idCol, cols };
}

async function guessBalanceTable(conn, schema) {
  const rows = await q(conn, `
    SELECT table_name AS t
    FROM information_schema.columns
    WHERE table_schema=? AND column_name IN ('virtue_balance','contrib_balance')
    GROUP BY table_name
    HAVING SUM(column_name='virtue_balance')>0 AND SUM(column_name='contrib_balance')>0
  `, [schema]);
  if (!rows.length) throw new Error('未找到同时包含 virtue_balance 与 contrib_balance 的积分余额表');
  const t = rows[0].t;
  const cols = await getColumns(conn, schema, t);
  const userIdCol = pickFirstExisting(cols, ['user_id','userid','uid','userId']);
  if (!userIdCol) throw new Error(`余额表 ${t} 未找到 user_id/uid 列`);
  const updatedCol = pickFirstExisting(cols, ['updated_at','update_time','updatedAt','modified_at','gmt_modified']);
  return { table: t, userIdCol, updatedCol, cols };
}

async function guessLedgerTable(conn, schema) {
  const rows = await q(conn, `
    SELECT table_name AS t
    FROM information_schema.columns
    WHERE table_schema=? AND column_name IN ('user_id','point_type','delta','created_at','create_time')
    GROUP BY table_name
    HAVING SUM(column_name='user_id')>0 AND SUM(column_name='point_type')>0 AND SUM(column_name IN ('created_at','create_time'))>0 AND SUM(column_name='delta')>0
  `, [schema]);
  if (!rows.length) throw new Error('未找到包含 user_id/point_type/delta/created_at 的积分流水表');
  // Prefer names containing ledger/log/points
  const prefer = ['points_ledger','ledger','point_ledger','points_log','point_log','integral_log'];
  rows.sort((a,b)=> (prefer.indexOf(a.t)+999) - (prefer.indexOf(b.t)+999));
  const t = rows[0].t;
  const cols = await getColumns(conn, schema, t);
  const userIdCol = pickFirstExisting(cols, ['user_id','userid','uid','userId']);
  const createdCol = pickFirstExisting(cols, ['created_at','create_time','createdAt','gmt_create','ctime','add_time']);
  const idCol = pickFirstExisting(cols, ['id','ledger_id']);
  const balanceAfterCol = pickFirstExisting(cols, ['balance_after','balanceAfter']);
  const sourceTypeCol = pickFirstExisting(cols, ['source_type','sourceType']);
  const sourceIdCol = pickFirstExisting(cols, ['source_id','sourceId']);
  const remarkCol = pickFirstExisting(cols, ['remark','memo','note']);
  return { table: t, userIdCol, createdCol, idCol, balanceAfterCol, sourceTypeCol, sourceIdCol, remarkCol, cols };
}

function buildUserPointsSQL(users, balance) {
  const updatedExpr = balance.updatedCol
    ? `DATE_FORMAT(up.\`${balance.updatedCol}\`, '%Y-%m-%dT%H:%i:%s') AS updatedAt`
    : `NULL AS updatedAt`;
  const sql = `
    SELECT
      u.openid AS _id,
      u.openid AS openid,
      up.virtue_balance AS virtueBalance,
      up.contrib_balance AS contribBalance,
      ${updatedExpr}
    FROM \`${balance.table}\` up
    JOIN \`${users.table}\` u ON u.\`${users.idCol}\` = up.\`${balance.userIdCol}\`
    WHERE u.openid IS NOT NULL
  `;
  return sql;
}

function buildLedgerSQL(users, ledger) {
  const createdExpr = ledger.createdCol
    ? `DATE_FORMAT(l.\`${ledger.createdCol}\`, '%Y-%m-%dT%H:%i:%s') AS createdAt`
    : `DATE_FORMAT(NOW(), '%Y-%m-%dT%H:%i:%s') AS createdAt`;
  const balanceAfterExpr = ledger.balanceAfterCol ? `l.\`${ledger.balanceAfterCol}\` AS balanceAfter` : `NULL AS balanceAfter`;
  const sourceTypeExpr = ledger.sourceTypeCol ? `l.\`${ledger.sourceTypeCol}\` AS sourceType` : `NULL AS sourceType`;
  const sourceIdExpr = ledger.sourceIdCol ? `l.\`${ledger.sourceIdCol}\` AS sourceId` : `NULL AS sourceId`;
  const remarkExpr = ledger.remarkCol ? `l.\`${ledger.remarkCol}\` AS remark` : `NULL AS remark`;
  const orderBy = ledger.createdCol ? `l.\`${ledger.createdCol}\`` : (ledger.idCol ? `l.\`${ledger.idCol}\`` : '1');
  const idOrder = ledger.idCol ? `, l.\`${ledger.idCol}\`` : '';
  const sql = `
    SELECT
      u.openid AS userId,
      UPPER(l.point_type) AS pointType,
      l.delta AS delta,
      ${balanceAfterExpr},
      ${sourceTypeExpr},
      ${sourceIdExpr},
      ${remarkExpr},
      ${createdExpr}
    FROM \`${ledger.table}\` l
    JOIN \`${users.table}\` u ON u.\`${users.idCol}\` = l.\`${ledger.userIdCol}\`
    WHERE u.openid IS NOT NULL
    ORDER BY ${orderBy}${idOrder}
  `;
  return sql;
}

async function run() {
  log('connecting...', cfg.user + '@' + cfg.host + ':' + cfg.port + '/' + cfg.database);
  const conn = await mysql.createConnection(cfg);
  try {
    const users = await guessUsersTable(conn, cfg.database);
    log('users table =>', users);

    const balance = await guessBalanceTable(conn, cfg.database);
    log('balance table =>', balance);

    const ledger = await guessLedgerTable(conn, cfg.database);
    log('ledger table =>', ledger);

    const exportDir = path.join(process.cwd(), 'exports');
    ensureDir(exportDir);

    // user_points export
    const sqlUP = buildUserPointsSQL(users, balance);
    log('export user_points SQL =>\n' + sqlUP);
    const rowsUP = await q(conn, sqlUP);
    const csvUP = toCSV(['_id','openid','virtueBalance','contribBalance','updatedAt'], rowsUP);
    const fileUP = path.join(exportDir, 'user_points.csv');
    fs.writeFileSync(fileUP, csvUP);
    log('written', fileUP, `rows=${rowsUP.length}`);

    // points_ledger export
    const sqlL = buildLedgerSQL(users, ledger);
    log('export points_ledger SQL =>\n' + sqlL);
    const rowsL = await q(conn, sqlL);
    const csvL = toCSV(['userId','pointType','delta','balanceAfter','sourceType','sourceId','remark','createdAt'], rowsL);
    const fileL = path.join(exportDir, 'points_ledger.csv');
    fs.writeFileSync(fileL, csvL);
    log('written', fileL, `rows=${rowsL.length}`);

    log('DONE. You can import these two CSV files into Cloud DB.');
  } finally {
    await conn.end();
  }
}

run().catch(e => { err(e.stack || e.message || e); process.exit(1); });

