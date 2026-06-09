exports.handler = async function(event, context) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY;
  const TWELVE_KEY     = process.env.TWELVE_DATA_API_KEY;
  const AV_KEY         = process.env.ALPHA_VANTAGE_API_KEY;
  const FINNHUB_KEY    = process.env.FINNHUB_API_KEY;

  const now     = new Date();
  const dateStr = now.toLocaleDateString('fr-FR', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  const today   = now.toISOString().split('T')[0];

  // ── Helpers ──────────────────────────────────────────────────
  async function fetchJSON(url) {
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      return await r.json();
    } catch(e) { return null; }
  }

  // ── 1. FOREX — EMA + RSI via Twelve Data ─────────────────────
  const forexPairs = ['EUR/USD','GBP/USD','USD/JPY','USD/CAD','AUD/USD','USD/CHF'];
  const techData   = {};

  await Promise.all(forexPairs.map(async pair => {
    const sym = pair.replace('/','');
    const [ema50r, ema200r, rsir] = await Promise.all([
      fetchJSON(`https://api.twelvedata.com/ema?symbol=${sym}&interval=4h&time_period=50&apikey=${TWELVE_KEY}&outputsize=1`),
      fetchJSON(`https://api.twelvedata.com/ema?symbol=${sym}&interval=4h&time_period=200&apikey=${TWELVE_KEY}&outputsize=1`),
      fetchJSON(`https://api.twelvedata.com/rsi?symbol=${sym}&interval=4h&time_period=14&apikey=${TWELVE_KEY}&outputsize=1`)
    ]);
    const ema50  = ema50r?.values?.[0]?.value  ? parseFloat(ema50r.values[0].value)  : null;
    const ema200 = ema200r?.values?.[0]?.value ? parseFloat(ema200r.values[0].value) : null;
    const rsi    = rsir?.values?.[0]?.value    ? parseFloat(rsir.values[0].value)    : null;
    let trend = 'neutre';
    if (ema50 && ema200) {
      if (ema50 > ema200 * 1.0001) trend = 'haussier';
      else if (ema50 < ema200 * 0.9999) trend = 'baissier';
    }
    let momentum = 'neutre';
    if (rsi) {
      if (rsi > 55) momentum = 'haussier';
      else if (rsi < 45) momentum = 'baissier';
    }
    const score = (trend === momentum && trend !== 'neutre') ? (trend === 'haussier' ? 8 : 7) :
                  (trend !== 'neutre' || momentum !== 'neutre') ? 5 : 3;
    techData[pair] = { ema50, ema200, rsi, trend, momentum, score };
  }));

  // ── 2. CRYPTO via CoinGecko ───────────────────────────────────
  const cryptoIds  = 'bitcoin,ethereum,solana,ripple';
  const cryptoData = await fetchJSON(
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${cryptoIds}&order=market_cap_desc&sparkline=false&price_change_percentage=24h,7d`
  );

  // Fear & Greed
  const fngData    = await fetchJSON('https://api.alternative.me/fng/?limit=1');
  const fearGreed  = fngData?.data?.[0]?.value || 'N/A';
  const fngLabel   = fngData?.data?.[0]?.value_classification || '';

  // ── 3. CALENDRIER Finnhub ─────────────────────────────────────
  let agendaData = [];
  if (FINNHUB_KEY) {
    const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
    const tmStr    = tomorrow.toISOString().split('T')[0];
    const finnData = await fetchJSON(
      `https://finnhub.io/api/v1/calendar/economic?from=${today}&to=${tmStr}&token=${FINNHUB_KEY}`
    );
    if (finnData?.economicCalendar) {
      agendaData = finnData.economicCalendar
        .filter(e => e.impact === 'high' || e.impact === 'medium')
        .slice(0, 12)
        .map(e => ({
          heure: (e.time||'00:00').substring(0,5),
          pays: e.country||'Global',
          evenement: e.event||'Evenement',
          prevision: e.estimate !== undefined ? String(e.estimate) : 'N/A',
          precedent: e.prev     !== undefined ? String(e.prev)     : 'N/A',
          importance: e.impact === 'high' ? '3' : '2'
        }));
    }
  }

  // ── 4. ACTIONS via Alpha Vantage (top movers) ─────────────────
  const tickers = ['AAPL','MSFT','NVDA','AMZN','META','GOOGL','SMCI','PLTR','ARM','RDDT'];
  const stockData = {};
  await Promise.all(tickers.slice(0,5).map(async t => {
    const d = await fetchJSON(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${t}&apikey=${AV_KEY}`
    );
    if (d?.['Global Quote']) {
      const q = d['Global Quote'];
      stockData[t] = {
        price:  parseFloat(q['05. price']||0).toFixed(2),
        change: parseFloat(q['10. change percent']||0).toFixed(2),
        volume: parseInt(q['06. volume']||0)
      };
    }
  }));

  // ── 5. Construire contexte pour Claude ───────────────────────
  const forexContext = forexPairs.map(p => {
    const d = techData[p] || {};
    return `${p}: EMA50=${d.ema50?.toFixed(5)||'N/A'} EMA200=${d.ema200?.toFixed(5)||'N/A'} RSI=${d.rsi?.toFixed(1)||'N/A'} Tendance=${d.trend} Score=${d.score}/10`;
  }).join('\n');

  const cryptoContext = cryptoData ? cryptoData.map(c =>
    `${c.symbol?.toUpperCase()}/USDT: $${c.current_price} | 24h:${c.price_change_percentage_24h?.toFixed(2)}% | 7j:${c.price_change_percentage_7d_in_currency?.toFixed(2)}% | MCap:$${(c.market_cap/1e9).toFixed(1)}B`
  ).join('\n') : 'Données CoinGecko indisponibles';

  const stockContext = Object.entries(stockData).map(([t,d]) =>
    `${t}: $${d.price} (${d.change}%)`
  ).join(' | ');

  const agendaContext = agendaData.length > 0
    ? agendaData.map(e => `${e.heure} ${e.pays} - ${e.evenement} (Impact:${e.importance === '3' ? 'FORT' : 'MOYEN'}) Prév:${e.prevision} Préc:${e.precedent}`).join('\n')
    : 'Aucun événement Finnhub disponible';

  // ── 6. Prompt Claude ─────────────────────────────────────────
  const prompt = `Tu es un analyste trading expert. Date: ${dateStr}.

DONNÉES TECHNIQUES RÉELLES (Twelve Data):
${forexContext}

DONNÉES CRYPTO RÉELLES (CoinGecko):
${cryptoContext}
Fear & Greed Index: ${fearGreed}/100 (${fngLabel})

ACTIONS (Alpha Vantage):
${stockContext || 'Données limitées'}

CALENDRIER ÉCONOMIQUE 48H (Finnhub):
${agendaContext}

Génère le briefing en FORMAT PIPE EXACT. Pas d apostrophe. Pas d emoji. 10 mots max par champ.

FOREX_SURVEILLER:
EUR/USD|1.0820|1.0920|haussier|Raison basee sur donnees reelles
GBP/USD|1.2600|1.2750|baissier|Raison basee sur donnees reelles
USD/JPY|148.00|150.50|haussier|Raison basee sur donnees reelles

FOREX:
EUR/USD|BIAIS|COURT|MOYEN|LONG|Analyse 8 mots basee sur EMA RSI reels|Impact news court
GBP/USD|BIAIS|COURT|MOYEN|LONG|Analyse 8 mots|Impact news court
USD/JPY|BIAIS|COURT|MOYEN|LONG|Analyse 8 mots|Impact news court
USD/CAD|BIAIS|COURT|MOYEN|LONG|Analyse 8 mots|Impact news court
AUD/USD|BIAIS|COURT|MOYEN|LONG|Analyse 8 mots|Impact news court
USD/CHF|BIAIS|COURT|MOYEN|LONG|Analyse 8 mots|Impact news court
NZD/USD|BIAIS|COURT|MOYEN|LONG|Analyse 8 mots|Impact news court
EUR/GBP|BIAIS|COURT|MOYEN|LONG|Analyse 8 mots|Impact news court
EUR/JPY|BIAIS|COURT|MOYEN|LONG|Analyse 8 mots|Impact news court
GBP/JPY|BIAIS|COURT|MOYEN|LONG|Analyse 8 mots|Impact news court
USD/MXN|BIAIS|COURT|MOYEN|LONG|Analyse 8 mots|Impact news court
EUR/CAD|BIAIS|COURT|MOYEN|LONG|Analyse 8 mots|Impact news court

ACTIONS_ETABLIES:
AAPL|Apple|haussier|COURT|MOYEN|LONG|Analyse basee sur donnees reelles
MSFT|Microsoft|haussier|COURT|MOYEN|LONG|Analyse basee sur donnees reelles
NVDA|Nvidia|haussier|COURT|MOYEN|LONG|Analyse basee sur donnees reelles
AMZN|Amazon|haussier|COURT|MOYEN|LONG|Analyse basee sur donnees reelles
GOOGL|Alphabet|neutre|COURT|MOYEN|LONG|Analyse basee sur donnees reelles
META|Meta|haussier|COURT|MOYEN|LONG|Analyse basee sur donnees reelles

ACTIONS_EMERGENTES:
SMCI|Super Micro Computer|haussier|COURT|MOYEN|LONG|Pourquoi surveiller
PLTR|Palantir|haussier|COURT|MOYEN|LONG|Pourquoi surveiller
ARM|ARM Holdings|haussier|COURT|MOYEN|LONG|Pourquoi surveiller
RDDT|Reddit|neutre|COURT|MOYEN|LONG|Pourquoi surveiller

CRYPTO:
BTC/USDT|BIAIS|COURT|MOYEN|LONG|Analyse basee sur donnees CoinGecko reelles|Impact news court
ETH/USDT|BIAIS|COURT|MOYEN|LONG|Analyse basee sur donnees CoinGecko reelles|Impact news court
SOL/USDT|BIAIS|COURT|MOYEN|LONG|Analyse basee sur donnees reelles|Impact news court
XRP/USDT|BIAIS|COURT|MOYEN|LONG|Analyse basee sur donnees reelles|Impact news court

NEWS:
Titre news majeure 1|Categorie|Impact marches en 8 mots|haute|Paires affectees
Titre news majeure 2|Categorie|Impact marches|moyenne|Paires affectees
Titre news majeure 3|Categorie|Impact marches|haute|Paires affectees
Titre news majeure 4|Categorie|Impact marches|faible|Paires affectees
Titre news majeure 5|Categorie|Impact marches|haute|Paires affectees

Remplace TOUS les BIAIS COURT MOYEN LONG et analyses par de vraies valeurs basees sur les donnees recues. Garde le format pipe exact.`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1200,
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await resp.json();
    if (!resp.ok) return { statusCode: resp.status, headers, body: JSON.stringify({ error: data.error?.message }) };

    let raw = '';
    (data.content||[]).forEach(b => { if(b.type==='text') raw += b.text; });

    // Parser robuste
    const markers = ['FOREX_SURVEILLER','FOREX:','ACTIONS_ETABLIES','ACTIONS_EMERGENTES','CRYPTO:','NEWS:'];
    let startIdx = raw.length;
    for (const m of markers) {
      const idx = raw.indexOf(m);
      if (idx !== -1 && idx < startIdx) startIdx = idx;
    }
    if (startIdx < raw.length) raw = raw.substring(startIdx);

    const lines = raw.split('\n').map(l=>l.trim()).filter(l=>l.length>0);
    const result = {
      actions:[], forex:[], forex_surveiller:[], crypto:[], news:[],
      agenda: agendaData,
      source_agenda: agendaData.length > 0 ? 'Finnhub' : 'Estimé',
      tech_data: techData,
      fear_greed: { value: fearGreed, label: fngLabel },
      generated_at: now.toISOString()
    };

    let section = '';
    for (const line of lines) {
      if (line.startsWith('ACTIONS_ETABLIES'))  { section='etablie';    continue; }
      if (line.startsWith('ACTIONS_EMERGENTES')){ section='emergente';  continue; }
      if (line.startsWith('FOREX_SURVEILLER'))  { section='surveiller'; continue; }
      if (line.startsWith('FOREX'))             { section='forex';      continue; }
      if (line.startsWith('CRYPTO'))            { section='crypto';     continue; }
      if (line.startsWith('NEWS'))              { section='news';       continue; }
      if (!line.includes('|')) continue;
      const p = line.split('|').map(x=>x.trim());

      if ((section==='etablie'||section==='emergente') && p.length>=7)
        result.actions.push({ticker:p[0],nom:p[1],categorie:section,tendance:p[2],court:p[3],moyen:p[4],long:p[5],analyse:p[6]});
      else if (section==='forex' && p.length>=7)
        result.forex.push({paire:p[0],biais:p[1],court:p[2],moyen:p[3],long:p[4],analyse:p[5],impact_news:p[6]});
      else if (section==='surveiller' && p.length>=5)
        result.forex_surveiller.push({paire:p[0],support:p[1],resistance:p[2],biais:p[3],raison:p[4]});
      else if (section==='crypto' && p.length>=7)
        result.crypto.push({actif:p[0],biais:p[1],court:p[2],moyen:p[3],long:p[4],analyse:p[5],impact_news:p[6]});
      else if (section==='news' && p.length>=5)
        result.news.push({titre:p[0],categorie:p[1],impact:p[2],importance:p[3],marches:p[4]});
    }

    return { statusCode: 200, headers, body: JSON.stringify(result) };

  } catch(err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
