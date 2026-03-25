const Anthropic = require('@anthropic-ai/sdk');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  // Verify auth — require Supabase access token
  const authHeader = event.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return {
      statusCode: 401,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized' }),
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    };
  }

  const { analysisType, data, clientName, viewMode, benchmarks } = body;

  if (!analysisType || !data) {
    return {
      statusCode: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing analysisType or data' }),
    };
  }

  const validAnalysisTypes = ['monthly', 'weekly', 'post', 'brand-signal'];
  if (!validAnalysisTypes.includes(analysisType)) {
    return {
      statusCode: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `Invalid analysisType. Must be one of: ${validAnalysisTypes.join(', ')}` }),
    };
  }

  if (clientName !== undefined && (typeof clientName !== 'string' || clientName.length > 200)) {
    return {
      statusCode: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'clientName must be a string (max 200 chars)' }),
    };
  }

  if (viewMode !== undefined && viewMode !== 'organic' && viewMode !== 'sponsored') {
    return {
      statusCode: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'viewMode must be "organic" or "sponsored"' }),
    };
  }

  try {
    const client = new Anthropic({ apiKey });
    const prompt = buildPrompt(analysisType, data, clientName, viewMode, benchmarks);

    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
      system: SYSTEM_PROMPT,
    });

    const text = response.content[0]?.text || '';

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        insights: text,
        usage: {
          input_tokens: response.usage?.input_tokens || 0,
          output_tokens: response.usage?.output_tokens || 0,
        },
      }),
    };
  } catch (err) {
    console.error('Claude API error:', err.message);
    return {
      statusCode: 502,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to generate insights' }),
    };
  }
};

// --- System prompt ---
const SYSTEM_PROMPT = `You are a senior LinkedIn strategist at your agency, a digital marketing agency. You're writing internal performance notes for the account management team.

Rules:
• Be specific — always cite actual numbers, percentages, and deltas. Never say "impressions increased" without saying by how much.
• Be direct — skip preamble. Start with the most important finding.
• Be actionable — every recommendation must be something the team can do this week, not generic advice like "post more consistently."
• Use plain text only — no markdown headers, bold, or formatting. Use bullet points (•) for lists.
• Keep it concise — the team reads these quickly between calls.
• When numbers are provided for organic vs sponsored context, tailor your analysis to that specific channel.`;

// --- Prompt builders ---

function buildPrompt(type, data, clientName, viewMode, benchmarks) {
  const client = clientName || 'this client';
  const channel = viewMode === 'sponsored' ? 'Sponsored' : 'Organic';

  if (type === 'monthly') {
    return buildMonthlyPrompt(data, client, channel);
  }
  if (type === 'weekly') {
    return buildWeeklyPrompt(data, client, channel);
  }
  if (type === 'post') {
    return buildPostPrompt(data, client, benchmarks);
  }
  if (type === 'brand-signal') {
    return buildBrandSignalPrompt(data, client);
  }

  return `Analyze this LinkedIn data for ${client}:\n${JSON.stringify(data).substring(0, 3000)}`;
}

function buildMonthlyPrompt(data, client, channel) {
  // Only analyze last 3 months (with 1 prior month for context)
  const allMonths = data.slice(-4);
  const months = data.slice(-3);
  if (!months.length) return `No monthly data available for ${client}.`;

  const imprKey = channel === 'Sponsored' ? 'Impressions (sponsored)' : 'Impressions (organic)';

  const firstMonth = months[0]?.month || '';
  const lastMonth = months[months.length - 1]?.month || '';

  // Build readable table
  const table = allMonths.map(m => {
    const impr = m[imprKey] || 0;
    const clicks = m['Clicks (total)'] || 0;
    const reactions = m['Reactions (total)'] || 0;
    const comments = m['Comments (total)'] || 0;
    const reposts = m['Reposts (total)'] || 0;
    const engRate = ((m['Engagement rate (total)'] || 0) * 100).toFixed(2);
    const ctr = impr > 0 ? ((clicks / impr) * 100).toFixed(2) : '0.00';
    return `${m.month}  |  Impr: ${impr.toLocaleString()}  |  Clicks: ${clicks}  |  CTR: ${ctr}%  |  Reactions: ${reactions}  |  Comments: ${comments}  |  Reposts: ${reposts}  |  Eng: ${engRate}%`;
  }).join('\n');

  // Compare the 3 months against each other
  const latest = months[months.length - 1];
  const prior = months.length > 1 ? months[months.length - 2] : null;

  return `Analysis for ${firstMonth} – ${lastMonth}: ${channel} channel, ${client}.

Start your response with "Analysis for ${firstMonth} – ${lastMonth}".

DATA (${allMonths.length} months, oldest to newest):
${table}

Analyze the last 3 months. Provide:

1. Performance Summary
What's the trajectory over these 3 months? Is ${channel.toLowerCase()} reach growing, flat, or declining? How is engagement trending relative to impressions?

2. Standout Months
Which of the 3 months was best and worst? What might explain the difference?

3. Recommendations
2-3 specific things the AM team should do next month. Be concrete (e.g., "Increase posting frequency from 2x to 3x/week since October's 3-post weeks averaged 40% higher impressions" — not "post more").`;
}

function buildWeeklyPrompt(data, client, channel) {
  // Only analyze last 4 weeks (with 1 prior week for context)
  const allWeeks = data.slice(-5);
  const weeks = data.slice(-4);
  if (!weeks.length) return `No weekly data available for ${client}.`;

  const imprKey = channel === 'Sponsored' ? 'Impressions (sponsored)' : 'Impressions (organic)';

  const firstWeek = weeks[0]?.week || '';
  const lastWeek = weeks[weeks.length - 1]?.week || '';

  const table = allWeeks.map(w => {
    const impr = w[imprKey] || 0;
    const clicks = w['Clicks (total)'] || 0;
    const reactions = w['Reactions (total)'] || 0;
    const comments = w['Comments (total)'] || 0;
    const engRate = ((w['Engagement rate (total)'] || 0) * 100).toFixed(2);
    const ctr = impr > 0 ? ((clicks / impr) * 100).toFixed(2) : '0.00';
    return `${w.week}  |  Impr: ${impr.toLocaleString()}  |  Clicks: ${clicks}  |  CTR: ${ctr}%  |  Reactions: ${reactions}  |  Comments: ${comments}  |  Eng: ${engRate}%`;
  }).join('\n');

  // Week-over-week momentum
  const latest = weeks[weeks.length - 1];
  const prev = weeks.length > 1 ? weeks[weeks.length - 2] : null;
  let momentum = '';
  if (latest && prev) {
    const lastImpr = latest[imprKey] || 0;
    const prevImpr = prev[imprKey] || 0;
    const delta = prevImpr > 0 ? (((lastImpr - prevImpr) / prevImpr) * 100).toFixed(1) : 'N/A';
    const lastEng = (latest['Engagement rate (total)'] || 0) * 100;
    const prevEng = (prev['Engagement rate (total)'] || 0) * 100;
    const engDelta = prevEng > 0 ? (((lastEng - prevEng) / prevEng) * 100).toFixed(1) : 'N/A';
    momentum = `Latest week vs previous: Impressions ${delta}%, Engagement rate ${engDelta}%`;
  }

  return `Analysis for ${firstWeek} – ${lastWeek}: ${channel} channel, ${client}.

Start your response with "Analysis for ${firstWeek} – ${lastWeek}".

DATA (${allWeeks.length} weeks, oldest to newest):
${table}
${momentum ? `LATEST MOMENTUM: ${momentum}` : ''}

Analyze the last 4 weeks. Provide:

1. This Week's Pulse
How did the most recent week perform? Is it continuing a trend or an outlier?

2. Patterns
Any consistent patterns across the 4 weeks — is there a trend in engagement vs reach?

3. Recommendations
2-3 specific tactical moves for next week. Reference actual numbers from the data.`;
}

function buildPostPrompt(data, client, benchmarks) {
  const p = data;
  const title = p['Post title'] || 'Untitled';
  const type = p['Post type'] || 'Unknown';
  const impr = p['Impressions'] || 0;
  const clicks = p['Clicks'] || 0;
  const likes = p['Likes'] || 0;
  const comments = p['Comments'] || 0;
  const reposts = p['Reposts'] || 0;
  const engRate = p['Engagement rate'] || 0;
  const ctr = impr > 0 ? ((clicks / impr) * 100).toFixed(2) : '0.00';
  const engScore = p['engagement_score'] || 0;

  let benchmarkSection = '';
  if (benchmarks) {
    const b = benchmarks;
    const imprVsAvg = b.avgImpressions > 0 ? (((impr - b.avgImpressions) / b.avgImpressions) * 100).toFixed(0) : 'N/A';
    const engVsAvg = b.avgEngRate > 0 ? (((engRate - b.avgEngRate) / b.avgEngRate) * 100).toFixed(0) : 'N/A';
    benchmarkSection = `
BENCHMARKS (vs ${client}'s ${type.toLowerCase()} post averages):
• This post: ${impr.toLocaleString()} impressions (${imprVsAvg}% vs avg of ${Math.round(b.avgImpressions).toLocaleString()})
• This post: ${(engRate * 100).toFixed(2)}% engagement (${engVsAvg}% vs avg of ${(b.avgEngRate * 100).toFixed(2)}%)
• This post: ${clicks} clicks, CTR ${ctr}% (avg CTR: ${b.avgCTR}%)
• Total ${type.toLowerCase()} posts analyzed: ${b.totalPosts}
• Best post impressions: ${b.maxImpressions.toLocaleString()} | Worst: ${b.minImpressions.toLocaleString()}`;
  }

  return `Post analysis for ${client}.

POST DETAILS:
• Title: "${title.substring(0, 300)}"
• Type: ${type}
• Date: ${p['Created date'] || 'N/A'}
• Content Type: ${p['Content Type'] || 'N/A'}
• Author: ${p['Posted by'] || 'N/A'}

METRICS:
• Impressions: ${impr.toLocaleString()}
• Clicks: ${clicks} (CTR: ${ctr}%)
• Likes: ${likes}
• Comments: ${comments}
• Reposts: ${reposts}
• Engagement Rate: ${(engRate * 100).toFixed(2)}%
• Engagement Score: ${engScore}
${benchmarkSection}

Provide:

1. Performance Verdict
Was this a strong, average, or weak post? ${benchmarks ? 'Use the benchmarks to quantify — say exactly how much above or below average.' : 'Assess based on the raw engagement signals.'}

2. What Worked / What Didn't
Identify 1-2 specific factors (content type, timing, topic) that likely helped or hurt performance.

3. Recommendation
One specific, actionable suggestion to improve the next similar post. Be precise — reference actual numbers.`;
}

function buildBrandSignalPrompt(data, client) {
  // data is scoped to last 2 weeks + demographics (aggregate)
  const { contentSummary, followerSummary, visitorSummary, followerDemographics, visitorDemographics } = data || {};
  const period = data?.period || 'recent';

  let sections = [];

  if (contentSummary) {
    const cs = contentSummary;
    let contentBlock = `CONTENT PERFORMANCE (${period}):
• Impressions: ${(cs.totalImpressions || 0).toLocaleString()}
• Avg Engagement Rate: ${((cs.avgEngagement || 0) * 100).toFixed(2)}%
• Posts published: ${cs.totalPosts || 0}`;
    if (cs.weekOverWeek) {
      const wow = cs.weekOverWeek;
      contentBlock += `\n• Week-over-week impressions change: ${wow.impressionsDelta > 0 ? '+' : ''}${wow.impressionsDelta.toLocaleString()}`;
      contentBlock += `\n• Week-over-week engagement change: ${wow.engagementDelta > 0 ? '+' : ''}${(wow.engagementDelta * 100).toFixed(2)}pp`;
    }
    sections.push(contentBlock);
  }

  if (followerSummary) {
    sections.push(`FOLLOWER GROWTH (last ${followerSummary.days} days):
• New followers: ${followerSummary.newFollowers}`);
  }

  if (visitorSummary) {
    sections.push(`PAGE VISITORS (last ${visitorSummary.days} days):
• Unique visitors: ${visitorSummary.totalVisits}`);
  }

  if (followerDemographics) {
    const fd = followerDemographics;
    const topIndustries = (fd.industry || []).slice(0, 5).map(i => `${i.name}: ${i.count}`).join(', ');
    const topFunctions = (fd.job_function || []).slice(0, 5).map(i => `${i.name}: ${i.count}`).join(', ');
    const topSeniority = (fd.seniority || []).slice(0, 5).map(i => `${i.name}: ${i.count}`).join(', ');
    sections.push(`FOLLOWER DEMOGRAPHICS (aggregate):
• Top Industries: ${topIndustries}
• Top Job Functions: ${topFunctions}
• Top Seniority Levels: ${topSeniority}`);
  }

  if (visitorDemographics) {
    const vd = visitorDemographics;
    const topIndustries = (vd.industry || []).slice(0, 5).map(i => `${i.name}: ${i.count}`).join(', ');
    const topFunctions = (vd.job_function || []).slice(0, 5).map(i => `${i.name}: ${i.count}`).join(', ');
    sections.push(`VISITOR DEMOGRAPHICS (aggregate):
• Top Industries: ${topIndustries}
• Top Job Functions: ${topFunctions}`);
  }

  if (!sections.length) {
    return `No data available for brand signal analysis for ${client}.`;
  }

  return `Week-on-week brand signal analysis for ${client} (${period}).

${sections.join('\n\n')}

Write a single concise paragraph (3-5 sentences) comparing this week's performance to last week. Cover:
1. Whether engagement and reach went up or down, and why that might be
2. How the audience profile aligns with a B2B brand targeting pharma, biotech, and research decision-makers
3. One specific tactical recommendation for next week

Be direct and specific. Use actual numbers. Do not use bullet points — write in flowing prose.`;
}

