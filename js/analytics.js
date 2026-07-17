/* ── Colony analytics parsing: LinkedIn + Instagram report ingestion ──
   Classic script — loads after utils.js, before app.js. Relocated VERBATIM
   from app.js (modularization slice 6) — the full parser toolkit:
   - format helpers (fmtAnalytics, pctAnalytics, trendArrow, week/month labels)
   - normalizeDateStr, getReportCompareLabel, aggregateWeeklyToMonthly
   - parseLinkedInAnalytics / FollowersReport / VisitorsReport (content,
     followers, visitors exports; description-row vs header-row detection)
   - parseInstagramAnalytics (Meta Business Suite post export)
   - detectReportType — SHEET-NAME based by design: vendor xlsx.js sometimes
     can't read cells of real Meta .xls files, so never rely on cell content
   - mergeByKey (idempotent re-upload merge by stable key)
   Uses the global XLSX (vendor/xlsx.js) and browser File APIs — not pure;
   pure format helpers are unit-tested in tests/analytics.test.mjs. */

// Format large numbers
function fmtAnalytics(n) {
  if (n == null || isNaN(n)) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return Number(n).toLocaleString();
}

function pctAnalytics(n) {
  if (n == null || isNaN(n)) return '0%';
  return (n * 100).toFixed(1) + '%';
}

function trendArrow(current, previous) {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (prev === 0 && cur === 0) return '';
  if (cur > prev) return ' <span class="trend-up">↑</span>';
  if (cur < prev) return ' <span class="trend-down">↓</span>';
  return '';
}

function weekLabelAnalytics(w) {
  let ds = String(w || '').trim();
  // Normalize MM/DD/YYYY → YYYY-MM-DD
  const m = ds.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) ds = m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
  const d = new Date(ds + 'T00:00:00');
  if (isNaN(d.getTime())) return ds;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function monthLabelAnalytics(key) {
  const [y, m] = key.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

function normalizeDateStr(ds) {
  ds = String(ds || '').trim();
  const m = ds.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
  return ds;
}

function getReportCompareLabel(report) {
  const weekly = report.metrics_data || [];
  if (weekly.length < 1) return report.report_label || 'No data';
  if (weekly.length < 2) return `Week of ${weekLabelAnalytics(weekly[0].week)}`;
  const latest = weekly[weekly.length - 1];
  const prev = weekly[weekly.length - 2];
  const now = new Date();
  const latestDate = new Date(normalizeDateStr(latest.week) + 'T00:00:00');
  const diffDays = Math.floor((now - latestDate) / (1000 * 60 * 60 * 24));
  if (diffDays >= 0 && diffDays < 7) return 'This week vs last week';
  return `Week of ${weekLabelAnalytics(latest.week)} vs ${weekLabelAnalytics(prev.week)}`;
}

function aggregateWeeklyToMonthly(weekly) {
  const map = new Map();
  weekly.forEach(w => {
    const monthKey = w.week.substring(0, 7);
    if (!map.has(monthKey)) {
      map.set(monthKey, {
        month: monthKey,
        'Impressions (organic)': 0, 'Impressions (sponsored)': 0, 'Impressions (total)': 0,
        'Clicks (total)': 0, 'Reactions (total)': 0, 'Comments (total)': 0, 'Reposts (total)': 0,
        'New followers (organic)': 0, 'New followers (sponsored)': 0, 'New followers (total)': 0,
        'Engagement rate (total)': 0, _engCount: 0, 'Posts': 0
      });
    }
    const m = map.get(monthKey);
    m['Posts'] += w['Posts'] || 0;
    m['Impressions (organic)'] += w['Impressions (organic)'] || 0;
    m['Impressions (sponsored)'] += w['Impressions (sponsored)'] || 0;
    m['Impressions (total)'] += w['Impressions (total)'] || 0;
    m['Clicks (total)'] += w['Clicks (total)'] || 0;
    m['Reactions (total)'] += w['Reactions (total)'] || 0;
    m['Comments (total)'] += w['Comments (total)'] || 0;
    m['Reposts (total)'] += w['Reposts (total)'] || 0;
    m['New followers (organic)'] += w['New followers (organic)'] || 0;
    m['New followers (sponsored)'] += w['New followers (sponsored)'] || 0;
    m['New followers (total)'] += w['New followers (total)'] || 0;
    const eng = w['Engagement rate (total)'] || 0;
    if (eng > 0) { m['Engagement rate (total)'] += eng; m._engCount++; }
  });
  const months = [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
  months.forEach(m => {
    if (m._engCount > 0) m['Engagement rate (total)'] /= m._engCount;
    delete m._engCount;
  });
  return months;
}

// --- XLS/CSV Parsing ---
function parseLinkedInAnalytics(file, existingWb) {
  return new Promise((resolve, reject) => {
    function doParse(wb) {
      try {
        // Find sheets — LinkedIn exports have "Metrics" and "All posts" (or similar names)
        const metricsSheetName = wb.SheetNames.find(s => /metric/i.test(s)) || wb.SheetNames[0];
        const postsSheetName = wb.SheetNames.find(s => /post/i.test(s)) || wb.SheetNames[1];

        // LinkedIn XLS has a description row 0, actual headers in row 1, data from row 2
        // Use header:1 to get raw arrays, then manually map using row 1 as keys
        function parseLinkedInSheet(ws) {
          if (!ws) return [];
          const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          if (raw.length < 3) return [];
          // Row 0 = description, Row 1 = column headers, Row 2+ = data
          // But if row 0 looks like a short header (not a description), use it directly
          let headerIdx = 1;
          const r0First = String(raw[0][0] || '').trim();
          // If row 0 first cell is short (< 50 chars) and looks like a column name, use it as header
          if (r0First.length < 50 && (r0First === 'Date' || r0First === 'Post title')) {
            headerIdx = 0;
          }
          const headers = raw[headerIdx];
          const rows = [];
          for (let i = headerIdx + 1; i < raw.length; i++) {
            const obj = {};
            headers.forEach((h, idx) => { obj[String(h).trim()] = raw[i][idx] !== undefined ? raw[i][idx] : ''; });
            rows.push(obj);
          }
          return rows;
        }
        const metricsRaw = metricsSheetName ? parseLinkedInSheet(wb.Sheets[metricsSheetName]) : [];
        const postsRaw = postsSheetName ? parseLinkedInSheet(wb.Sheets[postsSheetName]) : [];

        // Aggregate metrics into weekly rollups
        const weeklyMap = new Map();
        metricsRaw.forEach(row => {
          // LinkedIn date column is usually "Date"
          let dateVal = row['Date'] || row['date'] || '';
          if (typeof dateVal === 'number') {
            // Excel serial date
            const d = new Date((dateVal - 25569) * 86400 * 1000);
            dateVal = d.toISOString().split('T')[0];
          } else if (dateVal instanceof Date) {
            dateVal = dateVal.toISOString().split('T')[0];
          } else {
            dateVal = String(dateVal).trim();
            // Convert MM/DD/YYYY to YYYY-MM-DD
            const slashParts = dateVal.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (slashParts) dateVal = slashParts[3] + '-' + slashParts[1].padStart(2, '0') + '-' + slashParts[2].padStart(2, '0');
          }
          if (!dateVal || dateVal.length < 8) return;

          // Compute week start (Monday)
          const dt = new Date(dateVal + 'T00:00:00');
          if (isNaN(dt.getTime())) return;
          const day = dt.getDay();
          const diff = day === 0 ? 6 : day - 1;
          const weekStart = new Date(dt);
          weekStart.setDate(dt.getDate() - diff);
          const weekKey = weekStart.toISOString().split('T')[0];

          if (!weeklyMap.has(weekKey)) {
            weeklyMap.set(weekKey, {
              week: weekKey,
              'Impressions (organic)': 0, 'Impressions (sponsored)': 0, 'Impressions (total)': 0,
              'Clicks (total)': 0, 'Reactions (total)': 0, 'Comments (total)': 0, 'Reposts (total)': 0,
              'New followers (organic)': 0, 'New followers (sponsored)': 0, 'New followers (total)': 0,
              'Engagement rate (total)': 0, _engCount: 0, 'Posts': 0
            });
          }
          const w = weeklyMap.get(weekKey);
          w['Impressions (organic)'] += Number(row['Impressions (organic)']) || 0;
          w['Impressions (sponsored)'] += Number(row['Impressions (sponsored)']) || 0;
          w['Impressions (total)'] += Number(row['Impressions (total)']) || Number(row['Impressions (organic)']) || 0;
          w['Clicks (total)'] += Number(row['Clicks (total)']) || 0;
          w['Reactions (total)'] += Number(row['Reactions (total)']) || 0;
          w['Comments (total)'] += Number(row['Comments (total)']) || 0;
          w['Reposts (total)'] += Number(row['Reposts (total)']) || 0;
          w['New followers (organic)'] += Number(row['New followers (organic)']) || 0;
          w['New followers (sponsored)'] += Number(row['New followers (sponsored)']) || 0;
          w['New followers (total)'] += Number(row['New followers (total)']) || Number(row['New followers (organic)']) || 0;
          const eng = Number(row['Engagement rate (total)']) || Number(row['Engagement rate (organic)']) || 0;
          if (eng > 0) { w['Engagement rate (total)'] += eng; w._engCount++; }
        });

        // Average out engagement rates
        const weekly = [...weeklyMap.values()].sort((a, b) => a.week.localeCompare(b.week));
        weekly.forEach(w => {
          if (w._engCount > 0) w['Engagement rate (total)'] /= w._engCount;
          delete w._engCount;
        });

        // Parse posts
        const posts = postsRaw.map(row => {
          const impressions = Number(row['Impressions']) || 0;
          const clicks = Number(row['Clicks']) || 0;
          const likes = Number(row['Likes']) || 0;
          const comments = Number(row['Comments']) || 0;
          const reposts = Number(row['Reposts']) || 0;
          const engRate = Number(row['Engagement rate']) || 0;
          const engScore = likes + comments * 2 + reposts * 3;

          let createdDate = row['Created date'] || '';
          let postWeekKey = '';
          if (typeof createdDate === 'number') {
            const d = new Date((createdDate - 25569) * 86400 * 1000);
            createdDate = d.toLocaleDateString('en-IN', { month: '2-digit', day: '2-digit', year: 'numeric' });
            const day = d.getDay(); const diff = day === 0 ? 6 : day - 1;
            const ws = new Date(d); ws.setDate(d.getDate() - diff);
            postWeekKey = ws.toISOString().split('T')[0];
          } else if (createdDate) {
            const str = String(createdDate).trim();
            const slashParts = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            const isoStr = slashParts ? slashParts[3] + '-' + slashParts[1].padStart(2, '0') + '-' + slashParts[2].padStart(2, '0') : str;
            const d = new Date(isoStr + 'T00:00:00');
            if (!isNaN(d.getTime())) {
              const day = d.getDay(); const diff = day === 0 ? 6 : day - 1;
              const ws = new Date(d); ws.setDate(d.getDate() - diff);
              postWeekKey = ws.toISOString().split('T')[0];
            }
          }

          // Count post in its weekly bucket
          if (postWeekKey && weeklyMap.has(postWeekKey)) {
            weeklyMap.get(postWeekKey)['Posts']++;
          }

          return {
            'Post title': row['Post title'] || '',
            'Post link': row['Post link'] || '',
            'Post type': row['Post type'] || (row['Campaign name'] ? 'Sponsored' : 'Organic'),
            'Created date': createdDate,
            'Posted by': row['Posted by'] || '',
            'Impressions': impressions,
            'Clicks': clicks,
            'Likes': likes,
            'Comments': comments,
            'Reposts': reposts,
            'Engagement rate': engRate,
            'Content Type': row['Content Type'] || '',
            engagement_score: engScore
          };
        }).sort((a, b) => b.engagement_score - a.engagement_score);

        // Compute summary totals
        const impressions_organic = weekly.reduce((s, w) => s + w['Impressions (organic)'], 0);
        const impressions_sponsored = weekly.reduce((s, w) => s + w['Impressions (sponsored)'], 0);
        const impressions_total = weekly.reduce((s, w) => s + w['Impressions (total)'], 0);
        const clicks = weekly.reduce((s, w) => s + w['Clicks (total)'], 0);
        const reactions = weekly.reduce((s, w) => s + w['Reactions (total)'], 0);
        const comments = weekly.reduce((s, w) => s + w['Comments (total)'], 0);
        const reposts = weekly.reduce((s, w) => s + w['Reposts (total)'], 0);
        const new_followers = weekly.reduce((s, w) => s + (w['New followers (total)'] || 0), 0);
        const new_followers_organic = weekly.reduce((s, w) => s + (w['New followers (organic)'] || 0), 0);
        const new_followers_sponsored = weekly.reduce((s, w) => s + (w['New followers (sponsored)'] || 0), 0);
        const avgEng = weekly.length ? weekly.reduce((s, w) => s + w['Engagement rate (total)'], 0) / weekly.length : 0;

        let dateFrom = '', dateTo = '';
        if (weekly.length) {
          dateFrom = weekLabelAnalytics(weekly[0].week);
          dateTo = weekLabelAnalytics(weekly[weekly.length - 1].week);
        }

        const summary = {
          impressions_total, impressions_organic, impressions_sponsored,
          clicks, reactions, comments, reposts,
          new_followers, new_followers_organic, new_followers_sponsored,
          avg_engagement: (avgEng * 100).toFixed(1),
          total_posts: posts.length,
          date_from: dateFrom, date_to: dateTo
        };

        const reportLabel = dateFrom && dateTo ? `${dateFrom} \u2013 ${dateTo}` : 'Analytics Report';

        resolve({
          metrics_data: weekly,
          posts_data: posts,
          summary,
          report_label: reportLabel
        });
      } catch (err) {
        reject(err);
      }
    }
    if (existingWb) { doParse(existingWb); }
    else {
      const reader = new FileReader();
      reader.onload = function(e) {
        if (typeof XLSX === 'undefined') { reject(new Error('SheetJS library not loaded')); return; }
        const data = new Uint8Array(e.target.result);
        doParse(XLSX.read(data, { type: 'array' }));
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    }
  });
}

// --- Followers Report Parser ---
function parseLinkedInFollowersReport(file, existingWb) {
  return new Promise((resolve, reject) => {
    function doParse(wb) {
      try {
        function parseSheet(ws) {
          if (!ws) return [];
          const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          if (raw.length < 2) return [];
          const headers = raw[0];
          const rows = [];
          for (let i = 1; i < raw.length; i++) {
            const obj = {};
            headers.forEach((h, idx) => { obj[String(h).trim()] = raw[i][idx] !== undefined ? raw[i][idx] : ''; });
            rows.push(obj);
          }
          return rows;
        }

        function parseDateVal(dateVal) {
          if (typeof dateVal === 'number') {
            return new Date((dateVal - 25569) * 86400 * 1000).toISOString().split('T')[0];
          } else if (dateVal instanceof Date) {
            return dateVal.toISOString().split('T')[0];
          }
          const s = String(dateVal).trim();
          const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
          return m ? m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0') : s;
        }

        // Parse "New followers" sheet → daily rows
        const followersSheet = wb.Sheets[wb.SheetNames.find(s => /new follower/i.test(s)) || wb.SheetNames[0]];
        const followersRaw = parseSheet(followersSheet);
        const dailyFollowers = followersRaw.map(row => ({
          date: parseDateVal(row['Date'] || ''),
          organic: Number(row['Organic followers']) || 0,
          sponsored: Number(row['Sponsored followers']) || 0,
          total: Number(row['Total followers']) || 0
        })).filter(r => r.date && r.date.length >= 8);

        // Parse demographic sheets
        function parseDemoSheet(sheetName, nameCol, countCol) {
          const ws = wb.Sheets[wb.SheetNames.find(s => s.toLowerCase() === sheetName.toLowerCase())];
          if (!ws) return [];
          const rows = parseSheet(ws);
          return rows.map(r => ({
            name: String(r[nameCol] || '').trim(),
            count: Number(r[countCol]) || 0
          })).filter(r => r.name && r.count > 0).sort((a, b) => b.count - a.count);
        }

        const demographics_data = {
          job_function: parseDemoSheet('Job function', 'Job function', 'Total followers'),
          seniority: parseDemoSheet('Seniority', 'Seniority', 'Total followers'),
          industry: parseDemoSheet('Industry', 'Industry', 'Total followers'),
          company_size: parseDemoSheet('Company size', 'Company size', 'Total followers'),
          location: parseDemoSheet('Location', 'Location', 'Total followers')
        };

        // Date range for label
        let dateFrom = '', dateTo = '';
        if (dailyFollowers.length) {
          dateFrom = weekLabelAnalytics(dailyFollowers[0].date);
          dateTo = weekLabelAnalytics(dailyFollowers[dailyFollowers.length - 1].date);
        }
        const reportLabel = dateFrom && dateTo ? `${dateFrom} – ${dateTo}` : 'Followers Report';

        resolve({
          metrics_data: dailyFollowers,
          demographics_data,
          report_label: reportLabel
        });
      } catch (err) { reject(err); }
    }
    if (existingWb) { doParse(existingWb); }
    else {
      const reader = new FileReader();
      reader.onload = function(e) {
        if (typeof XLSX === 'undefined') { reject(new Error('SheetJS library not loaded')); return; }
        const data = new Uint8Array(e.target.result);
        doParse(XLSX.read(data, { type: 'array' }));
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    }
  });
}

// --- Visitors Report Parser ---
function parseLinkedInVisitorsReport(file, existingWb) {
  return new Promise((resolve, reject) => {
    function doParse(wb) {
      try {

        function parseSheet(ws) {
          if (!ws) return [];
          const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          if (raw.length < 2) return [];
          const headers = raw[0];
          const rows = [];
          for (let i = 1; i < raw.length; i++) {
            const obj = {};
            headers.forEach((h, idx) => { obj[String(h).trim()] = raw[i][idx] !== undefined ? raw[i][idx] : ''; });
            rows.push(obj);
          }
          return rows;
        }

        function parseDateVal(dateVal) {
          if (typeof dateVal === 'number') {
            return new Date((dateVal - 25569) * 86400 * 1000).toISOString().split('T')[0];
          } else if (dateVal instanceof Date) {
            return dateVal.toISOString().split('T')[0];
          }
          const s = String(dateVal).trim();
          const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
          return m ? m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0') : s;
        }

        // Parse "Visitor metrics" sheet
        const visitorSheet = wb.Sheets[wb.SheetNames.find(s => /visitor metric/i.test(s)) || wb.SheetNames[0]];
        const visitorRaw = parseSheet(visitorSheet);
        const dailyVisitors = visitorRaw.map(row => ({
          date: parseDateVal(row['Date'] || ''),
          overview_views: Number(row['Overview page views (total)']) || 0,
          overview_unique: Number(row['Overview unique visitors (total)']) || 0,
          total_views: Number(row['Total page views (total)']) || 0,
          total_unique: Number(row['Total unique visitors (total)']) || 0
        })).filter(r => r.date && r.date.length >= 8);

        // Parse demographic sheets (same as followers but count column = "Total views")
        function parseDemoSheet(sheetName, nameCol, countCol) {
          const ws = wb.Sheets[wb.SheetNames.find(s => s.toLowerCase() === sheetName.toLowerCase())];
          if (!ws) return [];
          const rows = parseSheet(ws);
          return rows.map(r => ({
            name: String(r[nameCol] || '').trim(),
            count: Number(r[countCol]) || 0
          })).filter(r => r.name && r.count > 0).sort((a, b) => b.count - a.count);
        }

        const demographics_data = {
          job_function: parseDemoSheet('Job function', 'Job function', 'Total views'),
          seniority: parseDemoSheet('Seniority', 'Seniority', 'Total views'),
          industry: parseDemoSheet('Industry', 'Industry', 'Total views'),
          company_size: parseDemoSheet('Company size', 'Company size', 'Total views'),
          location: parseDemoSheet('Location', 'Location', 'Total views')
        };

        let dateFrom = '', dateTo = '';
        if (dailyVisitors.length) {
          dateFrom = weekLabelAnalytics(dailyVisitors[0].date);
          dateTo = weekLabelAnalytics(dailyVisitors[dailyVisitors.length - 1].date);
        }
        const reportLabel = dateFrom && dateTo ? `${dateFrom} – ${dateTo}` : 'Visitors Report';

        resolve({
          visitor_metrics: dailyVisitors,
          demographics_data,
          report_label: reportLabel
        });
      } catch (err) { reject(err); }
    }
    if (existingWb) { doParse(existingWb); }
    else {
      const reader = new FileReader();
      reader.onload = function(e) {
        if (typeof XLSX === 'undefined') { reject(new Error('SheetJS library not loaded')); return; }
        const data = new Uint8Array(e.target.result);
        doParse(XLSX.read(data, { type: 'array' }));
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    }
  });
}

// --- Instagram (Meta Insights) post export parser ---
// Single-sheet export from Meta Business Suite — Account info + post-level rows.
// Distinguished from LinkedIn by header signature, not sheet name (IG sheet
// names are <dateRange>_<numericId> and unstable).
function parseInstagramAnalytics(file, existingWb) {
  return new Promise((resolve, reject) => {
    function doParse(wb) {
      try {
        // Find the sheet containing IG post columns. Prefer header match, but
        // fall back to first non-empty sheet (detection has already classified
        // this workbook as Instagram, so any sheet with rows is the post sheet).
        let postSheetName = null;
        for (const name of wb.SheetNames) {
          const ws = wb.Sheets[name];
          if (!ws) continue;
          const firstRow = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })[0] || [];
          const headers = firstRow.map(h => String(h || '').trim().toLowerCase());
          if (headers.includes('account username') && headers.includes('permalink')) {
            postSheetName = name;
            break;
          }
        }
        if (!postSheetName) {
          // Fallback: first sheet with any data
          postSheetName = wb.SheetNames.find(n => {
            const ws = wb.Sheets[n];
            return ws && (ws['!ref'] || Object.keys(ws).some(k => /^[A-Z]+\d+$/.test(k)));
          }) || wb.SheetNames[0];
        }
        if (!postSheetName) { reject(new Error('Instagram workbook has no sheets')); return; }

        const rows = XLSX.utils.sheet_to_json(wb.Sheets[postSheetName], { defval: '' });
        if (!rows.length) { reject(new Error('Instagram export has no rows')); return; }

        const toIsoDate = (v) => {
          if (v === '' || v === null || v === undefined) return '';
          if (typeof v === 'number') {
            const d = new Date((v - 25569) * 86400 * 1000);
            return isNaN(d) ? '' : d.toISOString().split('T')[0];
          }
          if (v instanceof Date) return isNaN(v) ? '' : v.toISOString().split('T')[0];
          const s = String(v).trim();
          // MM/DD/YYYY or MM/DD/YYYY HH:MM
          const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
          if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
          // YYYY-MM-DD passes through
          if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
          return '';
        };

        const posts = rows.map(r => {
          const date = toIsoDate(r['Date'] || '');
          const publishDate = toIsoDate(r['Publish time'] || '');
          return {
            post_id: String(r['Post ID'] || ''),
            account_id: String(r['Account ID'] || ''),
            account_username: String(r['Account username'] || ''),
            account_name: String(r['Account name'] || ''),
            description: String(r['Description'] || '').slice(0, 500),
            duration_sec: Number(r['Duration (sec)']) || 0,
            publish_time: publishDate || String(r['Publish time'] || ''),
            permalink: String(r['Permalink'] || ''),
            post_type: String(r['Post type'] || ''),
            data_comment: String(r['Data comment'] || ''),
            date: date,
            views: Number(r['Views']) || 0,
            reach: Number(r['Reach']) || 0,
            likes: Number(r['Likes']) || 0,
            shares: Number(r['Shares']) || 0,
            follows: Number(r['Follows']) || 0,
            comments: Number(r['Comments']) || 0,
            saves: Number(r['Saves']) || 0
          };
        }).filter(p => p.post_id);

        if (!posts.length) { reject(new Error('No valid Instagram posts found (rows missing Post ID)')); return; }

        const sum = (k) => posts.reduce((s, p) => s + (p[k] || 0), 0);
        const totalReach = sum('reach');
        const totalEngagements = sum('likes') + sum('comments') + sum('saves') + sum('shares');
        const engagementRate = totalReach > 0 ? (totalEngagements / totalReach) : 0;

        const dates = posts.map(p => p.date || (p.publish_time || '').slice(0, 10)).filter(Boolean).sort();
        const dateFrom = dates[0] || '';
        const dateTo = dates[dates.length - 1] || '';

        const summary = {
          total_posts: posts.length,
          total_views: sum('views'),
          total_reach: totalReach,
          total_likes: sum('likes'),
          total_comments: sum('comments'),
          total_saves: sum('saves'),
          total_shares: sum('shares'),
          total_follows: sum('follows'),
          engagement_rate: engagementRate,
          avg_engagement: (engagementRate * 100).toFixed(2),
          date_from: dateFrom,
          date_to: dateTo,
          account_name: posts[0]?.account_name || '',
          account_username: posts[0]?.account_username || ''
        };

        const reportLabel = (dateFrom && dateTo)
          ? `${dateFrom} – ${dateTo}`
          : (summary.account_name || 'Instagram report');

        resolve({ posts_data: posts, summary, report_label: reportLabel });
      } catch (err) { reject(err); }
    }

    if (existingWb) { doParse(existingWb); return; }
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        if (typeof XLSX === 'undefined') { reject(new Error('SheetJS library not loaded')); return; }
        const data = new Uint8Array(e.target.result);
        doParse(XLSX.read(data, { type: 'array' }));
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

// --- Smart client-mismatch guard for Instagram uploads ---
// Returns a client object IF the IG account name/username matches a DIFFERENT
// client in state.clients than the current page's client. Returns null when
// there's no signal of mistake (account doesn't match any client, or matches
// the current one).
function findIgClientSuggestion(accountName, accountUsername, currentClientId) {
  if (!Array.isArray(state.clients)) return null;
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/official$/, '');
  const accountNorm = norm(accountName);
  const usernameNorm = norm(accountUsername);
  if (!accountNorm && !usernameNorm) return null;

  for (const c of state.clients) {
    if (!c || c.id === currentClientId) continue;
    const clientNorm = norm(c.name);
    if (!clientNorm || clientNorm.length < 3) continue;
    if (clientNorm === accountNorm || clientNorm === usernameNorm) return c;
    if (accountNorm.length >= 4 && (clientNorm.includes(accountNorm) || accountNorm.includes(clientNorm))) return c;
    if (usernameNorm.length >= 4 && (clientNorm.includes(usernameNorm) || usernameNorm.includes(clientNorm))) return c;
  }
  return null;
}

// --- Auto-detect report type ---
// Instagram detection tries TWO signals in order. Sheet-name pattern is primary
// because Meta Business Suite exports use <DateRange>_<longNumericId> (the
// trailing numeric ID is the page/account ID — always 12+ digits). Distinctive
// and doesn't require parsing cells. Header-based is the backup for future
// export shapes. LinkedIn detection (existing) uses sheet names too.
function detectReportType(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        if (typeof XLSX === 'undefined') { reject(new Error('SheetJS library not loaded')); return; }
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const names = wb.SheetNames || [];
        let type = null;

        // Instagram (Meta) — primary: sheet name ends with `_<long numeric ID>`
        if (names.some(s => /_\d{12,}$/.test(s))) type = 'instagram';

        // Instagram (Meta) — secondary: header-based fallback
        if (!type) {
          for (const name of names) {
            const ws = wb.Sheets[name];
            if (!ws) continue;
            const firstRow = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })[0] || [];
            const headers = firstRow.map(h => String(h || '').trim().toLowerCase());
            if (headers.includes('account username') && headers.includes('permalink') &&
                headers.some(h => ['likes', 'saves', 'reach'].includes(h))) {
              type = 'instagram';
              break;
            }
          }
        }

        // Instagram account-metrics CSV — Meta Insights export, ONE metric per
        // file: UTF-16, a sep= line, a title row, then Date/Primary daily
        // rows. The title is NOT always "Instagram <metric>" — real exports
        // say "Reach", "Views", "Content interactions" — so the signature is
        // the STRUCTURE: a short title row followed by a Date/Primary header.
        if (!type && names.length === 1) {
          const firstRows = XLSX.utils.sheet_to_json(wb.Sheets[names[0]], { header: 1, defval: '' }).slice(0, 5);
          const title = String((firstRows[0] || [])[0] || '').trim();
          const hasDatePrimary = firstRows.some(r =>
            String(r[0] || '').trim().toLowerCase() === 'date' &&
            String(r[1] || '').trim().toLowerCase() === 'primary');
          if (hasDatePrimary && title && title.length <= 60) type = 'instagram_metrics';
        }

        // Community Pulse — the LeadConnector comms workbook (per-send stats
        // sheet name starts "NewslettersAll…"; header fallback for renames)
        if (!type) {
          if (names.some(s => /^newslettersall/i.test(s.trim()))) type = 'community_pulse';
          else {
            for (const name of names) {
              const ws = wb.Sheets[name];
              if (!ws) continue;
              const firstRow = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })[0] || [];
              const headers = firstRow.map(h => String(h || '').trim().toLowerCase());
              if (headers.includes('email name') && headers.includes('open rate (%)')) { type = 'community_pulse'; break; }
            }
          }
        }

        // LinkedIn — sheet-name based
        if (!type) {
          if (names.some(s => /new follower/i.test(s))) type = 'followers';
          else if (names.some(s => /visitor metric/i.test(s))) type = 'visitors';
          else if (names.some(s => /metric/i.test(s)) || names.some(s => /post/i.test(s))) type = 'content';
        }

        if (!type) {
          // Single-sheet "Sheet1" = almost certainly a CSV. Meta post exports
          // and Instagram insights-metric CSVs are caught above; an
          // unrecognized CSV is most likely a LinkedIn report someone
          // converted — those need the original Excel export (multi-sheet,
          // detected by sheet names).
          if (names.length === 1 && /^sheet1$/i.test(names[0])) {
            reject(new Error('This CSV isn\'t a recognized Meta (Instagram) export. LinkedIn reports need the original Excel (.xls/.xlsx) download from LinkedIn — CSV versions aren\'t supported yet.'));
            return;
          }
          const sheetSummary = names.length ? ` Sheets found: ${names.join(', ')}.` : '';
          reject(new Error(`Could not detect report type.${sheetSummary} Expected a LinkedIn Content/Followers/Visitors export, an Instagram (Meta) post export, or the community comms workbook.`));
          return;
        }
        resolve({ type, workbook: wb });
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

// ═══════════════ Community Pulse (LeadConnector comms workbook) ═══════════════
// Parses the Comms_Report workbook the Northwind Nonprofit team maintains:
//  - a per-send stats sheet (name starts "NewslettersAll…"): one row per
//    newsletter/dispatch/survey send with delivered/opened/clicked/unsub counts
//  - "Newsletter subscriptions": the subscriber list (region/country/created)
//  - "Forum_<date>": the forum member roster (region/country/domain of work)
// Dates arrive as Excel serials (days since 1899-12-30) or ISO-ish strings.

function excelSerialToIso(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number' && isFinite(value)) {
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return isNaN(d) ? '' : d.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (/^\d{4,5}(\.\d+)?$/.test(s)) return excelSerialToIso(parseFloat(s));
  const direct = new Date(s.length > 10 ? s : s + 'T00:00:00');
  if (isNaN(direct)) return '';
  // V8 date parsing is lenient (e.g. "Total clicks: 1219" parses as year
  // 1219) — reject anything outside a plausible reporting window.
  const y = direct.getUTCFullYear();
  return (y >= 1990 && y <= 2100) ? direct.toISOString().slice(0, 10) : '';
}

// Strip the "N/A" + zero-width-space junk LeadConnector exports carry.
function cleanCommunityValue(v) {
  const s = String(v === null || v === undefined ? '' : v).replace(/[​‌﻿]/g, '').trim();
  return /^n\/?a$/i.test(s) ? '' : s;
}

function communityTopSegments(rows, field, limit, splitCommas) {
  const counts = new Map();
  (rows || []).forEach((r) => {
    const raw = cleanCommunityValue(r[field]);
    if (!raw) return;
    const parts = splitCommas ? raw.split(',').map(p => p.trim()).filter(Boolean) : [raw];
    parts.forEach(p => counts.set(p, (counts.get(p) || 0) + 1));
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit || 10)
    .map(([name, count]) => ({ name, count }));
}

// Summary is recomputed after merges too, so keep it a standalone pure fn.
function communityPulseSummary(sends, demographics) {
  const rows = (sends || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const totDelivered = rows.reduce((s, r) => s + (r.delivered || 0), 0);
  const totOpened = rows.reduce((s, r) => s + (r.opened || 0), 0);
  const totClicked = rows.reduce((s, r) => s + (r.clicked || 0), 0);
  const byType = {};
  rows.forEach((r) => {
    const t = r.send_type || 'Other';
    if (!byType[t]) byType[t] = { sends: 0, delivered: 0, opened: 0, clicked: 0 };
    byType[t].sends += 1;
    byType[t].delivered += r.delivered || 0;
    byType[t].opened += r.opened || 0;
    byType[t].clicked += r.clicked || 0;
  });
  Object.values(byType).forEach((t) => {
    t.open_rate = t.delivered > 0 ? t.opened / t.delivered : 0;
    t.click_rate = t.delivered > 0 ? t.clicked / t.delivered : 0;
  });
  return {
    total_sends: rows.length,
    date_from: rows.length ? rows[0].date : '',
    date_to: rows.length ? rows[rows.length - 1].date : '',
    open_rate: totDelivered > 0 ? totOpened / totDelivered : 0,
    click_rate: totDelivered > 0 ? totClicked / totDelivered : 0,
    total_unsubscribed: rows.reduce((s, r) => s + (r.unsubscribed || 0), 0),
    subscribers: demographics?.subscribers?.total || 0,
    forum_members: demographics?.forum?.total || 0,
    by_type: byType
  };
}

// Pure core (Node-testable): takes already-jsonified sheet rows.
function parseCommunityPulseRows(sheets) {
  const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
  const sends = (sheets.sends || [])
    .map((r) => ({
      date: excelSerialToIso(r['Date']),
      name: cleanCommunityValue(r['Email Name']),
      send_type: cleanCommunityValue(r['Type']) || 'Newsletter',
      delivered: Math.round(num(r['Delivered (#)'])),
      delivered_rate: num(r['Delivered (%)']),
      opened: Math.round(num(r['Opened (#)'])),
      open_rate: num(r['Open Rate (%)']),
      clicked: Math.round(num(r['Clicked (#)'])),
      click_rate: num(r['Click Rate (%)']),
      unsubscribed: Math.round(num(r['Unsubscribed (#)'])),
      hard_bounce: Math.round(num(r['Hard Bounce (#)'])),
      skipped: Math.round(num(r['Skipped (#)']))
    }))
    .filter((r) => r.date && r.delivered > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const subs = sheets.subscribers || [];
  const growth = new Map();
  subs.forEach((r) => {
    const iso = excelSerialToIso(r['Created']);
    if (!iso) return;
    const month = iso.slice(0, 7);
    growth.set(month, (growth.get(month) || 0) + 1);
  });
  const subscribers = subs.length ? {
    total: subs.length,
    by_region: communityTopSegments(subs, 'Region', 8),
    by_country: communityTopSegments(subs, 'Country', 12),
    growth_by_month: [...growth.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, count]) => ({ month, count }))
  } : null;

  const forumRows = sheets.forum || [];
  const forum = forumRows.length ? {
    total: forumRows.length,
    by_region: communityTopSegments(forumRows, 'Region', 8),
    by_country: communityTopSegments(forumRows, 'Country', 12),
    by_domain: communityTopSegments(forumRows, 'Domain of Work', 12, true),
    by_gender: communityTopSegments(forumRows, 'Gender', 5),
    by_source: communityTopSegments(forumRows, 'Source', 8)
  } : null;

  const demographics = { subscribers, forum };
  return {
    metrics_data: sends,
    demographics_data: demographics,
    summary: communityPulseSummary(sends, demographics),
    report_label: sends.length ? `${sends[0].date} – ${sends[sends.length - 1].date}` : 'Community pulse'
  };
}

// ═══════════ Instagram account-metrics CSV (Meta Insights export) ═══════════
// One metric per file: row 0 = title ("Instagram follows"), then a
// Date/Primary header row, then daily rows (dates arrive as Excel serials
// after SheetJS parses the ISO datetimes). Pure core is Node-testable.
function parseInstagramMetricsRows(rows) {
  const all = rows || [];
  const title = cleanCommunityValue((all[0] || [])[0]);
  // Real export titles: "Instagram follows", "Instagram link clicks" — but
  // also just "Reach", "Views", "Content interactions". The "Instagram"
  // prefix is optional branding; strip it for the metric key.
  if (!title || title.length > 60) return null;
  const metricLabel = title.replace(/^instagram\s+/i, '').trim();
  const metric = metricLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
  const headerIdx = all.findIndex(r =>
    String((r || [])[0] || '').trim().toLowerCase() === 'date' &&
    String((r || [])[1] || '').trim().toLowerCase() === 'primary');
  if (headerIdx < 0 || !metric) return null;
  const daily = [];
  for (let i = headerIdx + 1; i < all.length; i++) {
    const date = excelSerialToIso((all[i] || [])[0]);
    if (!date) continue;
    const v = parseFloat((all[i] || [])[1]);
    daily.push({ date, value: isFinite(v) ? v : 0 });
  }
  daily.sort((a, b) => a.date.localeCompare(b.date));
  return daily.length ? { metric, metricLabel, daily } : null;
}

function parseInstagramMetricsCsv(file, existingWb) {
  return new Promise((resolve, reject) => {
    try {
      const wb = existingWb;
      if (!wb) { reject(new Error('Workbook not loaded')); return; }
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
      const parsed = parseInstagramMetricsRows(rows);
      if (!parsed) { reject(new Error('Could not read this Instagram metrics CSV — expected a metric title row then Date/Primary daily rows.')); return; }
      resolve(parsed);
    } catch (err) { reject(err); }
  });
}

// SheetJS wrapper (browser): locates the sheets by name pattern.
function parseCommunityPulse(file, existingWb) {
  return new Promise((resolve, reject) => {
    try {
      const wb = existingWb;
      if (!wb) { reject(new Error('Workbook not loaded')); return; }
      const names = wb.SheetNames || [];
      const rowsOf = (name) => name ? XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' }) : [];
      const sendsName = names.find(s => /^newslettersall/i.test(s.trim()));
      if (!sendsName) { reject(new Error('No "NewslettersAll…" per-send stats sheet found in this workbook.')); return; }
      const parsed = parseCommunityPulseRows({
        sends: rowsOf(sendsName),
        subscribers: rowsOf(names.find(s => /^newsletter subscriptions/i.test(s.trim()))),
        forum: rowsOf(names.find(s => /^forum_/i.test(s.trim())))
      });
      if (!parsed.metrics_data.length) { reject(new Error('The per-send stats sheet has no usable rows.')); return; }
      resolve(parsed);
    } catch (err) { reject(err); }
  });
}

// --- Merge helper: appends new rows to existing, keyed by unique identifier ---
function mergeByKey(existing, incoming, keyFn) {
  const map = new Map();
  (existing || []).forEach(r => map.set(keyFn(r), r));
  (incoming || []).forEach(r => map.set(keyFn(r), r));
  return [...map.values()];
}

// Overview KPI math (pure — extracted from renderAnalyticsOverview, slice 8).
// Impressions/engagement compare last week vs previous week; followers and
// visitors compare last 7 days vs the previous 7 (needing >=7/>=14 data days).
function computeOverviewKpis(contentReport, followersReport, visitorsReport) {
  const weekly = contentReport?.metrics_data || [];
  const followerDaily = followersReport?.metrics_data || [];
  const visitorDaily = visitorsReport?.visitor_metrics || [];

  const latestWeek = weekly.length ? weekly[weekly.length - 1] : null;
  const prevWeek = weekly.length > 1 ? weekly[weekly.length - 2] : null;

  const lastWeekImpressions = latestWeek ? Math.round(latestWeek['Impressions (organic)'] || 0) : 0;
  const lastWeekEngRate = latestWeek ? (latestWeek['Engagement rate (total)'] || 0) : 0;

  const fLen = followerDaily.length;
  const fRecent = fLen >= 7 ? followerDaily.slice(-7).reduce((s, d) => s + (d.total || 0), 0) : 0;
  const fPrev = fLen >= 14 ? followerDaily.slice(-14, -7).reduce((s, d) => s + (d.total || 0), 0) : 0;

  const vLen = visitorDaily.length;
  const vRecent = vLen >= 7 ? visitorDaily.slice(-7).reduce((s, d) => s + (d.overview_unique || 0), 0) : 0;
  const vPrev = vLen >= 14 ? visitorDaily.slice(-14, -7).reduce((s, d) => s + (d.overview_unique || 0), 0) : 0;

  const kpis = [
    { label: 'Impressions', value: fmtAnalytics(lastWeekImpressions), arrow: prevWeek ? trendArrow(lastWeekImpressions, prevWeek['Impressions (organic)'] || 0) : '' },
    { label: 'Engagement Rate', value: pctAnalytics(lastWeekEngRate), arrow: prevWeek ? trendArrow(lastWeekEngRate, prevWeek['Engagement rate (total)'] || 0) : '' },
    { label: 'New Followers', value: fRecent > 0 ? `+${fmtAnalytics(fRecent)}` : '–', arrow: fLen >= 14 ? trendArrow(fRecent, fPrev) : '' },
    { label: 'Page Visits', value: vRecent > 0 ? fmtAnalytics(vRecent) : '–', arrow: vLen >= 14 ? trendArrow(vRecent, vPrev) : '' },
  ];

  return {
    kpis,
    kpiPeriod: latestWeek?.week ? `Week of ${weekLabelAnalytics(latestWeek.week)}` : 'Last week',
    hasPrevWeek: Boolean(prevWeek)
  };
}

// The last date a report's CONTENTS cover — staleness must come from this,
// never from uploaded_at: a frozen upload timestamp under fresh data cried
// wolf (Helix Labs, Jul 2026), and a fresh upload click on an OLD file is not
// fresh data. Mirrors the SQL backfill in migration 202607140001.
function computeDataThrough(reportType, data) {
  const iso = (v) => {
    const s = normalizeDateStr(String(v || '').slice(0, 10));
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
  };
  const maxOf = (rows, pick) => (rows || []).reduce((m, r) => {
    const d = iso(pick(r || {}));
    return d && d > m ? d : m;
  }, '');
  if (reportType === 'content') {
    const lastWeek = maxOf(data.metricsData, r => r.week);
    if (!lastWeek) return null;
    const d = new Date(lastWeek + 'T00:00:00');
    d.setDate(d.getDate() + 6); // a weekly row covers through its week END
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  if (reportType === 'followers') return maxOf(data.metricsData, r => r.date) || null;
  if (reportType === 'visitors') return maxOf(data.visitorMetrics, r => r.date) || null;
  if (reportType === 'instagram') {
    const posts = maxOf(data.postsData, p => p.date || p.publish_time);
    const daily = maxOf(data.metricsData, r => r.date);
    return (posts > daily ? posts : daily) || null;
  }
  if (reportType === 'community_pulse') return iso(data.summary && data.summary.date_to) || null;
  return null;
}
