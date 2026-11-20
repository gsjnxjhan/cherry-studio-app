/**
 * DeepChat: WebDAV 备份上传 / 最新备份下载。
 * 只搬运 BackupRuntime 产出的 zip，不解析内容；API Key 存 secure-store，不进备份。
 */
import { File, Paths } from 'expo-file-system';

export type WebDavConfig = {
  baseUrl: string;
  username: string;
  password: string;
  directory: string;
};

type BackupPort = {
  createBackup(): Promise<{ uri: string; filename: string }>;
};

const TIMEOUT_MS = 60_000;

function joinUrl(base: string, dir: string, name: string): string {
  const b = base.replace(/\/+$/, '');
  const d = dir.replace(/^\/+|\/+$/g, '');
  return d ? `${b}/${d}/${name}` : `${b}/${name}`;
}

function authHeader(cfg: WebDavConfig): string {
  return `Basic ${globalThis.btoa(`${cfg.username}:${cfg.password}`)}`;
}

async function ensureCollection(cfg: WebDavConfig): Promise<void> {
  const url = joinUrl(cfg.baseUrl, cfg.directory, '');
  try {
    await fetch(url, { method: 'MKCOL', headers: { Authorization: authHeader(cfg) } });
  } catch {
    /* 目录已存在时服务器返回 405；后续 PUT 会暴露真实错误 */
  }
}

/** 上传一次备份，返回文件名。 */
export async function uploadBackup(cfg: WebDavConfig, backup: BackupPort): Promise<string> {
  const { uri, filename } = await backup.createBackup();
  await ensureCollection(cfg);
  const target = joinUrl(cfg.baseUrl, cfg.directory, filename);

  const file = new File(uri);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(target, {
      method: 'PUT',
      headers: { Authorization: authHeader(cfg), 'Content-Type': 'application/zip' },
      body: await file.bytes(),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`WebDAV PUT ${res.status}`);
  } finally {
    clearTimeout(timer);
  }
  return filename;
}

type Entry = { href: string; lastmod: string };

function parseEntries(xml: string): Entry[] {
  const out: Entry[] = [];
  const responses = xml.split(/<(?:\w+:)?response>/i).slice(1);
  for (const chunk of responses) {
    const href = chunk.match(/<(?:\w+:)?href>([^<]+)</i);
    if (!href) continue;
    const name = decodeURIComponent(href[1]);
    if (!name.toLowerCase().endsWith('.zip')) continue;
    const mod = chunk.match(/<(?:\w+:)?getlastmodified>([^<]+)</i);
    out.push({ href: name, lastmod: mod ? mod[1] : '' });
  }
  return out;
}

/** 下载目录里最新的 .zip 到缓存，返回本地 uri。 */
export async function downloadLatestBackup(cfg: WebDavConfig): Promise<string> {
  const dirUrl = joinUrl(cfg.baseUrl, cfg.directory, '');
  const res = await fetch(dirUrl, {
    method: 'PROPFIND',
    headers: {
      Authorization: authHeader(cfg),
      Depth: '1',
      'Content-Type': 'application/xml',
    },
    body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getlastmodified/></d:prop></d:propfind>',
  });
  if (!res.ok) throw new Error(`WebDAV PROPFIND ${res.status}`);

  const entries = parseEntries(await res.text());
  if (entries.length === 0) throw new Error('WebDAV 上没有备份文件');
  entries.sort((a, b) => Date.parse(b.lastmod || '0') - Date.parse(a.lastmod || '0'));

  const newest = entries[0];
  const fileUrl = newest.href.startsWith('http') ? newest.href : new URL(newest.href, cfg.baseUrl).toString();
  const dl = await fetch(fileUrl, { headers: { Authorization: authHeader(cfg) } });
  if (!dl.ok) throw new Error(`WebDAV GET ${dl.status}`);

  const target = new File(Paths.cache, newest.href.split('/').pop() || 'backup.zip');
  if (target.exists) target.delete();
  target.write(new Uint8Array(await dl.arrayBuffer()));
  return target.uri;
}
