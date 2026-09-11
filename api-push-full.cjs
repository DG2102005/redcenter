const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO = 'DG2102005/redcenter';
const PARENT = 'c9a5f6feb5343fe93ca5bc2b14182a630badfb98';

function ghApi(endpoint, method = 'GET', body = null) {
  let cmd = `gh api repos/${REPO}${endpoint}`;
  if (method !== 'GET') cmd += ` -X ${method}`;
  if (body) {
    const tmpFile = path.join(process.env.TEMP, 'ghb-' + Date.now() + Math.random() + '.json');
    fs.writeFileSync(tmpFile, JSON.stringify(body));
    cmd += ` --input "${tmpFile}"`;
  }
  const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 });
  return JSON.parse(out);
}

function isTextFile(filePath) {
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(8192);
  const bytesRead = fs.readSync(fd, buf, 0, 8192, 0);
  fs.closeSync(fd);
  for (let i = 0; i < bytesRead; i++) if (buf[i] === 0) return false;
  return true;
}

// 遍历工作区所有文件（排除 .git, node_modules, dist）
function walkDir(dir, base = '') {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = base ? base + '/' + entry.name : entry.name;
    if (entry.isDirectory()) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.vite') continue;
      results.push(...walkDir(fullPath, relPath));
    } else {
      results.push({ fullPath, relPath });
    }
  }
  return results;
}

const files = walkDir('.');
console.log('Total files in workspace:', files.length);

// 为每个文件创建 blob
const blobMap = {};
let count = 0;
let fail = 0;
for (const f of files) {
  const content = fs.readFileSync(f.fullPath);
  const isText = isTextFile(f.fullPath);
  const body = {
    content: isText ? content.toString('utf8') : content.toString('base64'),
    encoding: isText ? 'utf-8' : 'base64',
  };
  try {
    const result = ghApi('/git/blobs', 'POST', body);
    blobMap[f.relPath] = result.sha;
    count++;
    if (count % 20 === 0) console.log('  blobs:', count, '/', files.length);
  } catch (e) {
    fail++;
    console.log('FAIL:', f.relPath, e.stderr ? e.stderr.slice(0, 150) : e.message);
  }
}
console.log('Blobs:', count, 'failed:', fail);

// 按目录分组构建 tree（GitHub API 一次最多 100 个条目，需要递归创建子 tree）
function buildTree(dirPath) {
  const children = [];
  const subDirs = new Set();
  for (const [relPath, sha] of Object.entries(blobMap)) {
    if (!relPath.startsWith(dirPath)) continue;
    const rest = relPath.slice(dirPath.length);
    if (rest.includes('/')) {
      subDirs.add(rest.split('/')[0]);
    } else {
      children.push({ path: rest, mode: '100644', type: 'blob', sha });
    }
  }
  for (const subDir of subDirs) {
    const subTreeSha = buildTree(dirPath + subDir + '/');
    children.push({ path: subDir, mode: '040000', type: 'tree', sha: subTreeSha });
  }
  if (children.length === 0) return null;
  const tree = ghApi('/git/trees', 'POST', { tree: children });
  return tree.sha;
}

console.log('Building tree...');
const rootTree = buildTree('');
console.log('Root tree:', rootTree);

// 创建 commit
const commit = ghApi('/git/commits', 'POST', {
  message: 'feat: UI redesign + hand row drag sort + cleanup\n\n- UI: 老牌馆实木质感方向(木纹顶栏/漆器红按钮/黄铜描边/座位卡深木底)\n- 欢迎页: 恢复最初文字标题+功能清单, 侧栏空态改对局规则卡\n- 对弈页: 中央金字改低对比中字徽记, AI思考去转圈图标\n- 手牌区: 去掉外框(避免盖牌), 默认排序含新摸牌, 分解模式支持拖拽重排吸附\n- 清理: 删除tmp_quiz占位测试/vite编译残留/UI改版备份目录\n- 资源: 麻将牌面图片从2048x2048压缩到512x512(70MB->10MB)',
  tree: rootTree,
  parents: [PARENT],
});
console.log('Commit:', commit.sha);

// 强制更新分支
const ref = ghApi('/git/refs/heads/main', 'PATCH', { sha: commit.sha, force: true });
console.log('Updated refs/heads/main ->', ref.object.sha);
console.log('DONE');
