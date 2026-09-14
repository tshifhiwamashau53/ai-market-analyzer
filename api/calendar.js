export default async function handler(req, res) {
  try {
    const response = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json', {
      headers: { 'User-Agent': 'AI-Market-Analyzer/1.0' }
    });
    if (!response.ok) throw new Error(`Calendar provider returned ${response.status}`);
    const data = await response.json();
    const events = (Array.isArray(data) ? data : []).map(e => ({
      date: e.date || '',
      title: e.title || e.event || '',
      currency: e.country || e.currency || '',
      impact: String(e.impact || '').toUpperCase(),
      forecast: e.forecast ?? null,
      previous: e.previous ?? null,
      actual: e.actual ?? null,
      url: e.url || ''
    })).filter(e => e.title && ['HIGH', 'MEDIUM'].includes(e.impact));

    return res.status(200).json({ updatedAt: new Date().toISOString(), events });
  } catch (error) {
    return res.status(502).json({ error: 'Live economic calendar unavailable', details: error.message, events: [] });
  }
}
