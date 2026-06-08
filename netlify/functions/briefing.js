exports.handler = async function(event, context) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json"
  };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: "Pas de cle API" }) };

  const prompt = `Reponds EXACTEMENT avec ce texte sans rien changer:

FOREX:
EUR/USD|haussier|haussier|neutre|haussier|BCE hawkish Fed pause|News: CPI US impact dollar
GBP/USD|baissier|baissier|neutre|baissier|BOE dovish UK ralentit|News: PIB UK faible

FOREX_SURVEILLER:
EUR/USD|1.0820|1.0920|haussier|OB 4H zone cle a surveiller
GBP/USD|1.2600|1.2750|baissier|FVG baissier resistance majeure

ACTIONS_ETABLIES:
AAPL|Apple|haussier|haussier|haussier|haussier|Resultats solides IA integration forte
MSFT|Microsoft|haussier|haussier|haussier|haussier|Azure cloud domination IA
NVDA|Nvidia|haussier|haussier|haussier|haussier|GPU IA demande insatiable
AMZN|Amazon|haussier|neutre|haussier|haussier|AWS solide retail resilient
GOOGL|Alphabet|neutre|neutre|haussier|haussier|IA competition search stable
META|Meta|haussier|haussier|haussier|haussier|Reels monetisation forte

ACTIONS_EMERGENTES:
SMCI|Super Micro Computer|haussier|haussier|haussier|haussier|Serveurs IA forte demande
PLTR|Palantir|haussier|haussier|haussier|haussier|Contrats gouvernement IA
ARM|ARM Holdings|haussier|haussier|haussier|haussier|Chips IA mobile domination
RDDT|Reddit|neutre|neutre|haussier|haussier|Monetisation donnees IA

CRYPTO:
BTC/USDT|haussier|haussier|haussier|haussier|ETF institutionnel adoption|News: Bitcoin ETF flux positifs
ETH/USDT|neutre|neutre|haussier|haussier|Staking rendement stable|News: upgrade reseau prevu
SOL/USDT|haussier|haussier|haussier|haussier|DeFi actif TVL croissant|News: ecosysteme fort
XRP/USDT|neutre|neutre|neutre|haussier|Reglementaire incertain|News: SEC decision en attente

NEWS:
Fed maintient taux directeurs|Politique monetaire|Dollar renforce pause Fed baissier EUR|haute|EUR/USD USD/JPY
BCE signaux hawkish|Politique monetaire|Euro soutenu divergence BCE Fed|haute|EUR/USD EUR/GBP
Chine stimulus economique|Macro global|AUD soutenu risk on crypto hausse|moyenne|AUD/USD BTC ETH
Emploi US resilient|Macro USA|Dollar fort impact baissier majeurs|haute|EUR/USD GBP/USD AUD/USD
Tensions geopolitiques|Geopolitique|CHF JPY refuge or hausse|moyenne|USD/CHF USD/JPY XAU/USD`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 900,
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await resp.json();
    let raw = '';
    (data.content||[]).forEach(b => { if(b.type==='text') raw += b.text; });

    // Parser identique au briefing_v7
    const sectionMarkers = ['FOREX_SURVEILLER','FOREX:','ACTIONS_ETABLIES','ACTIONS_EMERGENTES','CRYPTO:','NEWS:'];
    let startIdx = raw.length;
    for (const marker of sectionMarkers) {
      const idx = raw.indexOf(marker);
      if (idx !== -1 && idx < startIdx) startIdx = idx;
    }
    if (startIdx < raw.length) raw = raw.substring(startIdx);

    const lines = raw.split('\n').map(l=>l.trim()).filter(l=>l.length>0);
    const result = { actions:[], forex:[], forex_surveiller:[], crypto:[], news:[], agenda:[], source_agenda:'Debug' };
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
