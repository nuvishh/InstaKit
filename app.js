/* InstaKit — Instagram follow analyser. 100% client-side.
 * Reads the official Instagram data download (followers_1.json,
 * following.json, pending_follow_requests.json — or the full ZIP) and
 * computes who doesn't follow back, pending requests, a followers
 * timeline, insights, and — across visits — who unfollowed you. */
'use strict';
const $ = id => document.getElementById(id);

let followers = new Set(), following = new Set(), pending = new Map();
let followerTimes = new Map();
let hasFollowers = false, hasFollowing = false;
let activeTab = 'notback';

/* ---------- extraction ---------- */
function extractEntries(json) {
  const out = []; // {name, ts}
  const walk = node => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (Array.isArray(node.string_list_data)) {
      node.string_list_data.forEach(s => {
        if (s && s.value) out.push({ name: String(s.value).trim().toLowerCase(), ts: Number(s.timestamp) || 0 });
      });
    }
    Object.values(node).forEach(walk);
  };
  walk(json);
  return out;
}
function classify(json, filename) {
  const f = (filename || '').toLowerCase();
  if (f.includes('pending') || (json && json.relationships_follow_requests_sent)) return 'pending';
  if (json && !Array.isArray(json) && json.relationships_following) return 'following';
  if (json && !Array.isArray(json) && json.relationships_followers) return 'followers';
  if (f.includes('following')) return 'following';
  if (f.includes('follower')) return 'followers';
  if (Array.isArray(json)) return 'followers';
  return null;
}
function addJson(json, filename) {
  const kind = classify(json, filename);
  const entries = extractEntries(json);
  if (!kind || !entries.length) return { ok: false, kind, count: 0 };
  if (kind === 'followers') {
    entries.forEach(e => { followers.add(e.name); if (e.ts) followerTimes.set(e.name, e.ts); });
    hasFollowers = true;
  } else if (kind === 'following') {
    entries.forEach(e => following.add(e.name));
    hasFollowing = true;
  } else if (kind === 'pending') {
    entries.forEach(e => pending.set(e.name, e.ts));
  }
  return { ok: true, kind, count: entries.length };
}

/* ---------- minimal ZIP reader (stored + deflate) ---------- */
async function unzipJsonEntries(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  const floor = Math.max(0, buf.length - 22 - 66000);
  for (let i = buf.length - 22; i >= floor; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a ZIP file');
  const count = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const out = [];
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    const method = dv.getUint16(off + 10, true);
    const csize = dv.getUint32(off + 20, true);
    const nlen = dv.getUint16(off + 28, true);
    const elen = dv.getUint16(off + 30, true);
    const clen = dv.getUint16(off + 32, true);
    const lhoff = dv.getUint32(off + 42, true);
    const name = new TextDecoder().decode(buf.subarray(off + 46, off + 46 + nlen));
    off += 46 + nlen + elen + clen;
    if (!/\.json$/i.test(name) || /blocked|close_friends|recently_dismissed/i.test(name)) continue;
    const dataStart = lhoff + 30 + dv.getUint16(lhoff + 26, true) + dv.getUint16(lhoff + 28, true);
    const comp = buf.subarray(dataStart, dataStart + csize);
    let text = null;
    if (method === 0) text = new TextDecoder().decode(comp);
    else if (method === 8 && 'DecompressionStream' in window) {
      const stream = new Blob([comp]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      text = await new Response(stream).text();
    }
    if (text) out.push({ name: name.split('/').pop(), text });
  }
  return out;
}

/* ---------- file intake ---------- */
function chip(text, warn) {
  const c = document.createElement('span');
  c.className = 'chip' + (warn ? ' warn' : '');
  c.textContent = text;
  $('fileChips').appendChild(c);
}
function setStatus(msg, isErr) {
  const el = $('status');
  el.textContent = msg || '';
  el.className = 'status' + (isErr ? ' err' : '');
}
async function handleFiles(files) {
  let anyOk = false;
  for (const file of files) {
    try {
      if (/\.zip$/i.test(file.name)) {
        const entries = await unzipJsonEntries(file);
        let zOk = 0;
        for (const e of entries) {
          let json; try { json = JSON.parse(e.text); } catch (err) { continue; }
          const r = addJson(json, e.name);
          if (r.ok) { zOk++; chip('📦 ' + e.name + ' — ' + r.count.toLocaleString() + ' people'); }
        }
        if (!zOk) chip('📦 ' + file.name + ' — no usable JSON found', true);
        else anyOk = true;
      } else if (/\.json$/i.test(file.name)) {
        const json = JSON.parse(await file.text());
        const r = addJson(json, file.name);
        if (r.ok) { anyOk = true; chip('📄 ' + file.name + ' — ' + r.count.toLocaleString() + ' people'); }
        else chip('📄 ' + file.name + ' — could not read usernames', true);
      }
    } catch (e) {
      chip('⚠ ' + file.name + ' — ' + e.message, true);
    }
  }
  if (hasFollowers && hasFollowing) analyse();
  else if (anyOk) {
    setStatus(hasFollowers
      ? 'Followers loaded (' + followers.size.toLocaleString() + '). Now add the following file too.'
      : 'Following loaded (' + following.size.toLocaleString() + '). Now add the followers file too.');
  }
}

/* ---------- helpers ---------- */
const fmtDate = ts => ts ? new Date(ts * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const daysSince = ts => ts ? Math.max(0, Math.floor((Date.now() / 1000 - ts) / 86400)) : 0;
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/* ---------- analysis ---------- */
let lists = { notback: [], fans: [], mutuals: [], pending: [], timeline: [] };
function analyse() {
  lists = {
    notback: [...following].filter(u => !followers.has(u)).sort().map(u => ({ u })),
    fans: [...followers].filter(u => !following.has(u)).sort().map(u => ({ u })),
    mutuals: [...following].filter(u => followers.has(u)).sort().map(u => ({ u })),
    pending: [...pending.entries()].map(([u, ts]) => ({ u, ts })).sort((a, b) => (a.ts || 0) - (b.ts || 0)),
    timeline: [...followers].map(u => ({ u, ts: followerTimes.get(u) || 0 })).sort((a, b) => b.ts - a.ts)
  };
  $('stFollowing').textContent = following.size.toLocaleString();
  $('stFollowers').textContent = followers.size.toLocaleString();
  $('stNotBack').textContent = lists.notback.length.toLocaleString();
  $('stMutuals').textContent = lists.mutuals.length.toLocaleString();
  renderInsights();
  renderDiff();
  saveSnapshot();
  $('results').style.display = 'block';
  setStatus('Done ✓ — ' + lists.notback.length + ' people don\'t follow you back' +
    (lists.pending.length ? ', ' + lists.pending.length + ' requests pending.' : '.'));
  renderList();
  $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function renderInsights() {
  const fw = following.size, fr = followers.size, mu = lists.mutuals.length;
  const backPct = fw ? Math.round(mu / fw * 100) : 0;
  const fanPct = fr ? Math.round(mu / fr * 100) : 0;
  $('insights').innerHTML =
    '<div class="irow"><span>Follow-back rate</span><div class="bar"><div style="width:' + backPct + '%"></div></div><b>' + backPct + '%</b></div>' +
    '<div class="irow"><span>You follow back</span><div class="bar alt"><div style="width:' + fanPct + '%"></div></div><b>' + fanPct + '%</b></div>' +
    '<div class="irow"><span>Audience ratio</span><b>' + fr.toLocaleString() + ' followers : ' + fw.toLocaleString() + ' following</b></div>' +
    (lists.pending.length ? '<div class="irow"><span>Requests pending</span><b>' + lists.pending.length + '</b></div>' : '');
}
/* ----- snapshot diff: who unfollowed / new followers since last check ----- */
function renderDiff() {
  const box = $('diffBox');
  let prev = null;
  try { prev = JSON.parse(localStorage.getItem('instakitSnapshot') || 'null'); } catch (e) {}
  if (!prev || !prev.followers) {
    box.style.display = 'block';
    box.innerHTML = '<h4>🕵️ Unfollow tracker</h4>Baseline saved ✓ — load a fresh export next week and I\'ll show who unfollowed you and who\'s new.';
    return;
  }
  const prevF = new Set(prev.followers);
  const lost = [...prevF].filter(u => !followers.has(u)).sort();
  const gained = [...followers].filter(u => !prevF.has(u)).sort();
  box.style.display = 'block';
  if (!lost.length && !gained.length) {
    box.innerHTML = '<h4>🕵️ Since your last check (' + prev.date + ')</h4>No changes — nobody unfollowed, no new followers in this export.';
    return;
  }
  box.innerHTML = '<h4>🕵️ Since your last check (' + prev.date + ')</h4>' +
    (lost.length ? '<div><span class="lost">Unfollowed you (' + lost.length + '):</span> ' + lost.map(u => '@' + esc(u)).join(', ') + '</div>' : '') +
    (gained.length ? '<div><span class="gained">New followers (' + gained.length + '):</span> ' + gained.map(u => '@' + esc(u)).join(', ') + '</div>' : '');
}
function saveSnapshot() {
  try {
    localStorage.setItem('instakitSnapshot', JSON.stringify({
      date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      followers: [...followers], following: [...following]
    }));
  } catch (e) {}
}

/* ---------- list rendering ---------- */
function rowMeta(row) {
  if (activeTab === 'pending') {
    if (!row.ts) return '';
    const d = daysSince(row.ts);
    return d >= 365 ? Math.floor(d / 365) + 'y waiting' : d >= 30 ? Math.floor(d / 30) + 'mo waiting' : d + 'd waiting';
  }
  if (activeTab === 'timeline') return fmtDate(row.ts);
  return '';
}
function renderList() {
  const q = ($('search').value || '').trim().toLowerCase();
  const rows = lists[activeTab].filter(r => !q || r.u.includes(q));
  $('listEmpty').style.display = rows.length ? 'none' : 'block';
  $('list').innerHTML = rows.map(r => {
    const meta = rowMeta(r);
    return '<div class="urow"><span class="uava">' + esc(r.u.charAt(0)) + '</span>' +
      '<a href="https://www.instagram.com/' + encodeURIComponent(r.u) + '/" target="_blank" rel="noopener">@' + esc(r.u) + '</a>' +
      (meta ? '<span class="meta">' + meta + '</span>' : '') +
      '<span class="go">Open ↗</span></div>';
  }).join('');
}
document.querySelectorAll('.tab').forEach(b => {
  b.onclick = () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    activeTab = b.dataset.tab;
    renderList();
  };
});
$('search').addEventListener('input', renderList);
$('copyList').onclick = async () => {
  const txt = lists[activeTab].map(r => r.u).join('\n');
  try { await navigator.clipboard.writeText(txt); $('copyList').textContent = '✅ Copied ' + lists[activeTab].length; }
  catch (e) { $('copyList').textContent = 'Copy failed'; }
  setTimeout(() => { $('copyList').textContent = '📋 Copy list'; }, 1600);
};
function download(content, filename, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
$('dlList').onclick = () => download(lists[activeTab].map(r => r.u).join('\n'), 'instakit-' + activeTab + '.txt', 'text/plain');
$('dlCsv').onclick = () => {
  const all = [];
  Object.keys(lists).forEach(k => lists[k].forEach(r => all.push(k + ',' + r.u + (r.ts ? ',' + fmtDate(r.ts) : ','))));
  download('list,username,date\n' + all.join('\n'), 'instakit-export.csv', 'text/csv');
};

/* ---------- paste mode ---------- */
$('pasteGo').onclick = () => {
  const parse = id => $(id).value.split(/[\s,]+/).map(s => s.replace(/^@/, '').trim().toLowerCase()).filter(Boolean);
  followers = new Set(parse('pasteFollowers')); following = new Set(parse('pasteFollowing'));
  followerTimes = new Map(); pending = new Map();
  hasFollowers = followers.size > 0; hasFollowing = following.size > 0;
  if (hasFollowers && hasFollowing) analyse();
  else setStatus('Paste both lists — followers on the left, following on the right.', true);
};

/* ---------- drop / pick ---------- */
const drop = $('drop');
drop.onclick = () => $('filePick').click();
$('filePick').addEventListener('change', e => { handleFiles([...e.target.files]); e.target.value = ''; });
['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => handleFiles([...e.dataTransfer.files]));
