#!/usr/bin/env node
import { getDb, initSchema, closeDb } from '../src/db.js';
import { listHealth, reactivateSource } from '../src/models/sourceHealth.js';

const command = process.argv[2];
const arg = process.argv[3];

const db = getDb();
initSchema(db);

function printHealth(health) {
  console.log(`\nID  Name                           Active  Failures  Last Error                  Last Error At`);
  console.log('-'.repeat(110));
  for (const row of health) {
    const name = row.name.padEnd(30);
    const active = row.isActive ? 'yes' : 'NO';
    const failures = String(row.consecutiveFailures).padStart(8);
    const lastError = (row.lastError || '').slice(0, 30).padEnd(30);
    const lastErrorAt = row.lastErrorAt || '-';
    console.log(`${String(row.id).padStart(2)}  ${name}  ${active.padEnd(6)}  ${failures}  ${lastError}  ${lastErrorAt}`);
  }
}

try {
  if (command === 'list' || !command) {
    const health = listHealth();
    printHealth(health);
    const inactive = health.filter((h) => !h.isActive);
    if (inactive.length > 0) {
      console.log(`\n提示：${inactive.length} 个来源已被自动停用。可用以下命令重新激活：`);
      console.log(`  node scripts/sourceHealth.js activate <id>`);
      console.log(`  node scripts/sourceHealth.js activate-all`);
    }
  } else if (command === 'activate') {
    const id = Number(arg);
    if (!Number.isFinite(id) || id <= 0) {
      console.error('请提供有效的来源 ID');
      process.exit(1);
    }
    const activated = reactivateSource(id);
    if (activated) {
      console.log(`来源 ${id} 已重新激活，失败计数已重置。`);
    } else {
      console.log(`来源 ${id} 不存在或已经是激活状态。`);
    }
  } else if (command === 'activate-all') {
    const health = listHealth();
    const inactive = health.filter((h) => !h.isActive);
    if (inactive.length === 0) {
      console.log('没有已停用的来源。');
    } else {
      for (const row of inactive) {
        reactivateSource(row.id);
      }
      console.log(`已重新激活 ${inactive.length} 个来源。`);
    }
  } else {
    console.log('用法：');
    console.log('  node scripts/sourceHealth.js list          # 列出所有来源健康状态（默认）');
    console.log('  node scripts/sourceHealth.js activate <id>  # 重新激活指定来源');
    console.log('  node scripts/sourceHealth.js activate-all  # 重新激活所有已停用来源');
  }
} finally {
  closeDb();
}
