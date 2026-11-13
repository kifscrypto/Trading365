(() => {
  'use strict'

  const appView = document.querySelector('#app-view')
  const appBanners = document.querySelector('#app-banners')
  const toast = document.querySelector('#toast')
  const engineStatus = document.querySelector('#engine-status')
  const engineDot = document.querySelector('#engine-dot')
  const signalCount = document.querySelector('#signal-count')
  const ui = { view: 'overview', selectedKey: '', directionFilter: 'all', newsQuery: '', newsCategory: 'all' }
  let appState = null
  let updateInfo = null
  let toastTimer
  let refreshInFlight = false
  let activationInFlight = false

  function canUseLiveFeatures() {
    return appState && ['active', 'trial', 'unconfigured'].includes(appState.license.status)
  }

  const icons = {
    signal: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18 9 12l4 3 7-9M16 6h4v4"/></svg>',
    news: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/></svg>',
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"/></svg>',
    bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16v-6a6 6 0 0 1 12 0v6l2 2H4l2-2ZM10 21h4"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M14 7l5 5-5 5"/></svg>',
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character])
  }

  function formatPrice(value) {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—'
    const digits = Math.abs(value) >= 100 ? 2 : Math.abs(value) >= 1 ? 4 : 6
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
  }

  function formatCompact(value) {
    if (!Number.isFinite(value)) return '—'
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value)
  }

  function formatPercent(value, digits = 2) {
    if (!Number.isFinite(value)) return '—'
    return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`
  }

  function formatTime(value, includeDate = false) {
    if (!value || Number.isNaN(Date.parse(value))) return '—'
    return new Intl.DateTimeFormat('en-GB', includeDate
      ? { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }
      : { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }).format(new Date(value))
  }

  function relativeTime(value) {
    if (!value || Number.isNaN(Date.parse(value))) return 'never'
    const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 1000))
    if (seconds < 60) return `${seconds}s ago`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return `${Math.floor(seconds / 86400)}d ago`
  }

  function showToast(message) {
    clearTimeout(toastTimer)
    toast.textContent = message
    toast.classList.add('is-visible')
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3500)
  }

  function openSignals() {
    return appState.signals.filter(signal => signal.status === 'open')
  }

  function selectionFor(key) {
    if (key.startsWith('signal:')) {
      const id = key.slice(7)
      const signal = appState.signals.find(item => item.id === id)
      if (signal) return { kind: 'signal', signal, asset: appState.assets.find(asset => asset.symbol === signal.symbol && asset.exchange === signal.exchange) }
    }
    if (key.startsWith('asset:')) {
      const [, exchange, symbol] = key.split(':')
      const asset = appState.assets.find(item => item.exchange === exchange && item.symbol === symbol)
      if (asset) return { kind: 'asset', asset }
    }
    return null
  }

  function selectedItem() {
    const existing = selectionFor(ui.selectedKey)
    if (existing) return existing
    const firstSignal = openSignals()[0]
    if (firstSignal) {
      ui.selectedKey = `signal:${firstSignal.id}`
      return selectionFor(ui.selectedKey)
    }
    const preferred = appState.assets.find(asset => asset.symbol === 'BTC') || appState.assets[0]
    if (preferred) {
      ui.selectedKey = `asset:${preferred.exchange}:${preferred.symbol}`
      return selectionFor(ui.selectedKey)
    }
    return null
  }

  function relatedNews(symbol, limit = 3) {
    const tagged = appState.news.filter(item => item.tags.includes(symbol))
    const general = appState.news.filter(item => !item.tags.includes(symbol))
    return [...tagged, ...general].slice(0, limit)
  }

  function viewHeader(title, subtitle, actions = '') {
    return `<header class="view-header"><div><h1 class="view-heading">${escapeHtml(title)}</h1><p class="view-subtitle">${escapeHtml(subtitle)}</p></div><div class="view-actions">${actions}<button class="button" type="button" data-action="refresh" ${refreshInFlight || !canUseLiveFeatures() ? 'disabled' : ''}>${refreshInFlight ? 'Refreshing…' : 'Refresh'}</button></div></header>`
  }

  function directionBadge(side) {
    return `<span class="badge badge-${side}">${side}</span>`
  }

  function signalRows() {
    const signals = openSignals().filter(signal => ui.directionFilter === 'all' || signal.side === ui.directionFilter)
    if (!signals.length) {
      return `<div class="empty-state"><strong>No fired ${ui.directionFilter === 'all' ? '' : ui.directionFilter + ' '}entries</strong><p>The local model has not found a setup that passes every gate. Candidate assets remain available below and in the Signals workspace.</p></div>`
    }
    return `<div class="signal-list">${signals.map(signal => {
      const key = `signal:${signal.id}`
      return `<button class="signal-row ${key === ui.selectedKey ? 'is-selected' : ''}" type="button" data-key="${escapeHtml(key)}" aria-pressed="${key === ui.selectedKey}">
        <span class="signal-row-top"><span class="signal-pair"><span class="asset-dot">${escapeHtml(signal.symbol.slice(0, 2))}</span>${escapeHtml(signal.symbol)}/USDT</span>${directionBadge(signal.side)}</span>
        <span class="signal-row-price"><strong>${formatPrice(signal.entry)}</strong><span class="positive">FIRED</span></span>
        <span class="signal-row-bottom"><span>${escapeHtml(signal.exchange)} · ${relativeTime(signal.firedAt)}</span><span class="signal-score">Score <strong>${signal.score}</strong>/15</span></span>
      </button>`
    }).join('')}</div>`
  }

  function assetRows() {
    if (!appState.assets.length) return ''
    const assets = [...appState.assets].sort((a, b) => {
      const aSelected = a.symbol === 'BTC' || a.symbol === 'ETH' ? 1 : 0
      const bSelected = b.symbol === 'BTC' || b.symbol === 'ETH' ? 1 : 0
      return bSelected - aSelected || b.volume24h - a.volume24h
    })
    return `<div class="context-block"><h3>Market watchlist</h3><div class="watchlist-grid">${assets.map(asset => {
      const key = `asset:${asset.exchange}:${asset.symbol}`
      const watched = appState.watchlist.includes(asset.symbol)
      return `<button class="watchlist-row ${key === ui.selectedKey ? 'is-selected' : ''}" type="button" data-key="${escapeHtml(key)}" aria-pressed="${key === ui.selectedKey}"><span>${escapeHtml(asset.symbol)}</span><span class="number">${formatPrice(asset.price)}</span><span class="${asset.change24h >= 0 ? 'positive' : 'negative'}">${formatPercent(asset.change24h)}</span><span class="dim">${watched ? 'WATCHING' : asset.exchange}</span></button>`
    }).join('')}</div></div>`
  }

  function signalsPanel() {
    return `<section class="panel" aria-labelledby="active-signals-title"><div class="panel-header"><h2 class="panel-title" id="active-signals-title">${icons.signal}Fired signals</h2><span class="panel-meta">${openSignals().length} OPEN</span></div>${signalRows()}${assetRows()}<div class="signal-footer">Candidates and market assets are not fired trades. Entries require every model gate.</div></section>`
  }

  function chartSvg(candles, item) {
    if (!candles?.length) return '<div class="empty-state"><strong>No chart candles</strong><p>The selected provider has not returned candle data for this asset.</p></div>'
    const width = 760, height = 258, left = 34, right = 76, top = 18, bottom = 34
    const plotWidth = width - left - right, plotHeight = height - top - bottom
    const points = candles.slice(-60)
    const signal = item.kind === 'signal' ? item.signal : null
    const levels = signal ? [signal.entry, signal.stop, signal.targets[0]] : []
    const values = [...points.map(candle => candle.close), ...levels]
    const minimum = Math.min(...values), maximum = Math.max(...values)
    const padding = (maximum - minimum || Math.max(maximum * .01, 1)) * .12
    const low = minimum - padding, high = maximum + padding
    const x = index => left + index * plotWidth / Math.max(points.length - 1, 1)
    const y = value => top + (high - value) * plotHeight / (high - low)
    const line = points.map((candle, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(candle.close).toFixed(1)}`).join(' ')
    const color = signal?.side === 'short' ? '#ff6b79' : '#3df08a'
    const area = `${line} L${x(points.length - 1).toFixed(1)},${top + plotHeight} L${left},${top + plotHeight} Z`
    const grids = Array.from({ length: 5 }, (_, index) => {
      const lineY = top + index * plotHeight / 4
      const value = high - index * (high - low) / 4
      return `<line class="chart-grid" x1="${left}" y1="${lineY}" x2="${left + plotWidth}" y2="${lineY}"/><text class="chart-label" x="${left + plotWidth + 10}" y="${lineY + 3}">${formatPrice(value)}</text>`
    }).join('')
    const level = (value, className, label) => `<line class="${className}" x1="${left}" y1="${y(value)}" x2="${left + plotWidth}" y2="${y(value)}"/><text class="chart-label" x="${left + 5}" y="${y(value) - 5}">${label}</text>`
    const symbol = signal?.symbol ?? item.asset.symbol
    return `<svg class="price-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(symbol)} 4H candle chart${signal ? ` with entry ${formatPrice(signal.entry)}, stop ${formatPrice(signal.stop)}, first target ${formatPrice(signal.targets[0])}` : ''}.">${grids}<path class="chart-area" d="${area}" fill="${color}"/><path class="chart-line ${signal?.side === 'short' ? 'short' : ''}" d="${line}"/>${signal ? level(signal.entry, 'chart-entry', 'ENTRY') + level(signal.stop, 'chart-stop', 'STOP') + level(signal.targets[0], 'chart-target', 'TP1') : ''}<text class="chart-label" x="${left}" y="${height - 8}">${formatTime(points[0].time, true)}</text><text class="chart-label" x="${left + plotWidth - 70}" y="${height - 8}">${formatTime(points.at(-1).time, true)}</text></svg>`
  }

  function actionButtons(item) {
    const asset = item.kind === 'signal' ? item.asset : item.asset
    const symbol = item.kind === 'signal' ? item.signal.symbol : asset.symbol
    const watched = appState.watchlist.includes(symbol)
    const signal = item.kind === 'signal' ? item.signal : null
    const alerted = signal && appState.alertedSignalIds.includes(signal.id)
    return `<div class="chart-actions"><button class="button ${watched ? 'is-on' : ''}" type="button" data-watch="${escapeHtml(symbol)}" aria-pressed="${watched}" ${!canUseLiveFeatures() ? 'disabled' : ''}>${icons.star}Watchlist</button>${signal ? `<button class="button ${alerted ? 'is-on' : ''}" type="button" data-alert="${escapeHtml(signal.id)}" aria-pressed="${alerted}" ${!canUseLiveFeatures() ? 'disabled' : ''}>${icons.bell}Alert</button>` : ''}<button class="button button-primary" type="button" data-view="signals">Full analysis${icons.arrow}</button></div>`
  }

  function chartPanel(item, full = false) {
    const signal = item.kind === 'signal' ? item.signal : null
    const asset = item.kind === 'signal' ? item.asset : item.asset
    if (!asset && !signal) return ''
    const symbol = signal?.symbol ?? asset.symbol
    const exchange = signal?.exchange ?? asset.exchange
    const price = signal?.currentPrice ?? asset.price
    const change = asset?.change24h ?? 0
    const candles = signal?.candles4h ?? asset?.candles4h
    return `<section class="panel" aria-labelledby="chart-panel-title"><div class="panel-header"><h2 class="panel-title" id="chart-panel-title">${signal ? 'Fired signal workspace' : 'Asset workspace'}</h2><span class="panel-meta">4H MODEL · 1H ENTRY</span></div><div class="panel-body">
      <div class="asset-header"><div class="asset-identity"><span class="asset-dot">${escapeHtml(symbol.slice(0, 2))}</span><div><h3 class="asset-name">${escapeHtml(symbol)}/USDT ${signal ? directionBadge(signal.side) : '<span class="badge">Asset</span>'}</h3><p class="asset-exchange">${escapeHtml(exchange)} · public provider data</p></div></div><div class="asset-price"><strong>${formatPrice(price)}</strong><span class="${change >= 0 ? 'positive' : 'negative'}">${formatPercent(change)} / 24H</span></div></div>
      <div class="chart-toolbar"><div class="timeframes" aria-label="Chart timeframe"><span class="timeframe">1H</span><span class="timeframe is-active">4H</span><span class="timeframe">1D</span></div><div class="chart-legend"><span><i class="legend-line"></i>Price</span>${signal ? '<span><i class="legend-line red"></i>Stop</span>' : ''}</div></div>
      <figure class="chart-figure">${chartSvg(candles, item)}<figcaption class="chart-caption"><span>Actual cached provider candles · times UTC</span><span>${signal ? `Fired ${formatTime(signal.firedAt, true)}` : 'No fired entry implied'}</span></figcaption></figure>
      ${signal ? `<div class="risk-grid"><div class="risk-item"><span>Entry</span><strong>${formatPrice(signal.entry)}</strong></div><div class="risk-item"><span>Stop</span><strong class="negative">${formatPrice(signal.stop)}</strong></div><div class="risk-item"><span>First target</span><strong class="positive">${formatPrice(signal.targets[0])}</strong></div></div>${full ? `<div class="targets-list">${signal.targets.map((target, index) => `<div class="target"><span>TP${index + 1}</span><strong>${formatPrice(target)}</strong></div>`).join('')}</div>` : ''}` : `<div class="risk-grid"><div class="risk-item"><span>Funding</span><strong>${formatPercent(asset.funding * 100, 4)}</strong></div><div class="risk-item"><span>Open interest</span><strong>${formatCompact(asset.openInterest)}</strong></div><div class="risk-item"><span>24H volume</span><strong>${formatCompact(asset.volume24h)}</strong></div></div>`}
      ${actionButtons(item)}
    </div></section>`
  }

  function scorePanel(item) {
    const signal = item.kind === 'signal' ? item.signal : null
    const asset = item.kind === 'signal' ? item.asset : item.asset
    const score = signal ? null : appState.market.regime === 'uptrend' ? asset?.longScore : asset?.shortScore
    const factors = signal?.factors ?? score?.factors ?? []
    const scoreValue = signal?.score ?? score?.adjustedScore
    const candidateLabel = signal ? 'Fired model score' : appState.market.regime === 'uptrend' ? 'Long candidate · not fired' : 'Short candidate · not fired'
    return `<section class="panel" aria-labelledby="score-title"><div class="panel-header"><h2 class="panel-title" id="score-title">Why this ${signal ? 'setup' : 'candidate'}</h2>${signal ? directionBadge(signal.side) : '<span class="badge">Watch</span>'}</div><div class="panel-body"><div class="score-total"><strong>${scoreValue ?? '—'}<span class="dim">/15</span></strong><span>${candidateLabel}</span></div>${factors.length ? `<div class="factor-list">${factors.map(factor => `<div><div class="factor-top"><span>${escapeHtml(factor.label)}</span><strong>+${factor.points}</strong></div><div class="factor-track"><div class="factor-fill ${signal?.side === 'short' || (!signal && appState.market.regime !== 'uptrend') ? 'short' : ''}" style="width:${Math.min(100, factor.points / factor.max * 100)}%"></div></div></div>`).join('')}</div>` : '<div class="empty-state"><strong>No confluence yet</strong><p>This asset has no active score factors under the current model and regime.</p></div>'}</div>
      <div class="context-block"><h3>Market context</h3><div class="context-rows"><div class="context-row"><span>BTC regime</span><strong>${escapeHtml(appState.market.regime)}</strong></div><div class="context-row"><span>Regime distance</span><strong>${formatPercent(appState.market.regimeDistance)}</strong></div>${asset ? `<div class="context-row"><span>Funding</span><strong>${formatPercent(asset.funding * 100, 4)}</strong></div><div class="context-row"><span>Open interest</span><strong>${formatCompact(asset.openInterest)}</strong></div>` : ''}</div></div></section>`
  }

  function newsItem(item, full = false, interactive = false) {
    const tags = item.tags.map(tag => interactive
      ? `<button class="news-tag news-tag-button" type="button" data-news-tag="${escapeHtml(tag)}" data-news-kind="asset" aria-label="Filter news by ${escapeHtml(tag)}">${escapeHtml(tag)}</button>`
      : `<span class="news-tag">${escapeHtml(tag)}</span>`).join('')
    const topic = interactive
      ? `<button class="news-tag news-tag-button news-tag-topic" type="button" data-news-tag="${escapeHtml(item.category)}" data-news-kind="topic" aria-label="Filter news by ${escapeHtml(item.category)} topic">${escapeHtml(item.category)}</button>`
      : `<span class="news-tag">${escapeHtml(item.category)}</span>`
    return `<article class="news-item ${full ? 'news-page-item' : ''}"><div class="news-item-top"><span class="news-source">${escapeHtml(item.source)}</span><time class="news-time" datetime="${escapeHtml(item.publishedAt)}">${relativeTime(item.publishedAt)}</time></div><h3 class="news-headline">${escapeHtml(item.title)}</h3>${full ? `<p class="news-summary">${escapeHtml(item.summary)}</p>` : ''}<div class="news-tags">${tags}${topic}</div>${full ? `<div class="chart-actions"><button class="text-button" type="button" data-url="${escapeHtml(item.url)}">Read at ${escapeHtml(item.source)} →</button></div>` : ''}</article>`
  }

  function compactNews(symbol) {
    const items = relatedNews(symbol)
    return `<section class="panel news-panel" aria-labelledby="related-news-title"><div class="panel-header"><h2 class="panel-title" id="related-news-title">${icons.news}Related news</h2><button class="text-button" type="button" data-view="news">View all</button></div>${items.length ? `<div class="news-list">${items.map(item => newsItem(item, false, true)).join('')}</div>` : '<div class="empty-state"><strong>No news available</strong><p>Publisher feeds have not returned stories yet. Scanner operation is unaffected.</p></div>'}<p class="news-demo">News is context only and never changes the model score</p></section>`
  }

  function marketStats() {
    const market = appState.market
    const stats = [
      { label: 'BTC / USDT', value: formatPrice(market.btcPrice), change: formatPercent(market.btcChange24h), tone: (market.btcChange24h ?? 0) >= 0 ? 'positive' : 'negative', note: 'Market leader' },
      { label: 'ETH / USDT', value: formatPrice(market.ethPrice), change: formatPercent(market.ethChange24h), tone: (market.ethChange24h ?? 0) >= 0 ? 'positive' : 'negative', note: 'Ethereum' },
      { label: 'BTC dominance', value: market.btcDominance === null ? '—' : `${market.btcDominance.toFixed(1)}%`, change: 'Global', tone: 'dim', note: 'Market share' },
      { label: 'Fear & Greed', value: market.fearGreed ?? '—', change: market.fearGreedLabel ?? 'Unavailable', tone: 'gold', note: 'Sentiment' },
    ]
    return `<div class="market-stats">${stats.map(stat => `<div class="market-stat"><div class="market-stat-top"><span>${stat.label}</span><span>${stat.note}</span></div><div class="market-stat-value"><strong>${stat.value}</strong><span class="${stat.tone}">${stat.change}</span></div></div>`).join('')}</div>`
  }

  function regimeBanner() {
    const market = appState.market
    const copy = market.regime === 'uptrend' ? 'Long entries can fire when their gates align. New short entries are suppressed.' : market.regime === 'downtrend' ? 'Short entries can fire when their gates align. New long entries are suppressed.' : market.regime === 'neutral' ? 'BTC is inside the model’s neutral band. New entries remain suppressed.' : 'BTC regime is unavailable. No new entries can fire until structure is confirmed.'
    const badge = market.regime === 'uptrend' ? 'bullish' : market.regime === 'downtrend' ? 'bearish' : 'gold'
    return `<section class="regime-banner" aria-label="Current market regime"><div><div class="regime-heading"><span class="badge badge-${badge}">${escapeHtml(market.regime)}</span><h2>${market.regime === 'neutral' || market.regime === 'unknown' ? 'The scanner is standing down' : 'Market regime is driving the scanner'}</h2></div><p class="regime-copy">${copy}</p></div><div class="regime-score"><strong>${formatPercent(market.regimeDistance)}</strong><span>BTC vs 4H EMA50</span></div></section>`
  }

  function paywallPanel() {
    return `<section class="panel paywall" aria-label="Trial ended"><div class="paywall-body"><span class="eyebrow gold">Trial ended</span><h2>Live scanning is paused</h2><p>Your 7-day trial has ended. New signals, live prices, and changes to your watchlist or alerts are paused until you activate. Everything already cached stays available offline.</p><div class="paywall-actions"><button class="button button-primary" type="button" data-action="goto-license">Activate T365 Terminal →</button><span class="paywall-note">One-time payment · perpetual licence · all future versions</span></div></div></section>`
  }

  function emptyWorkspace(paywall = '') {
    return `${viewHeader('Market overview', 'Your local engine is ready, but no market data is cached yet.')}${paywall}<section class="panel empty-state"><strong>No market data available</strong><p>${escapeHtml(appState.message || 'Check your internet connection and refresh. The app will retain any data it successfully downloads for later offline use.')}</p><button class="button button-primary" type="button" data-action="refresh">Try public providers again</button></section>`
  }

  function renderOverview() {
    const paywall = appState.license.status === 'expired' ? paywallPanel() : ''
    if (!appState.assets.length) return emptyWorkspace(paywall)
    const item = selectedItem()
    return `${viewHeader('Market overview', 'Live public data, your local scanner, and the context around it.')}${paywall}${regimeBanner()}${marketStats()}<div class="overview-grid">${signalsPanel()}<div class="overview-center">${item ? chartPanel(item) : ''}</div>${item ? compactNews(item.kind === 'signal' ? item.signal.symbol : item.asset.symbol) : ''}</div>`
  }

  function directionFilters() {
    return `<div class="filter-group" aria-label="Filter signals by direction">${['all', 'long', 'short'].map(filter => `<button class="filter-button ${ui.directionFilter === filter ? 'is-active' : ''}" type="button" data-filter="${filter}" aria-pressed="${ui.directionFilter === filter}">${filter[0].toUpperCase() + filter.slice(1)}</button>`).join('')}</div>`
  }

  function renderSignals() {
    const item = selectedItem()
    return `${viewHeader('Signal workspace', 'Fired entries, candidate scores, actual candles, and model reasoning.', directionFilters())}<div class="signals-layout">${signalsPanel()}${item ? chartPanel(item, true) : '<section class="panel empty-state"><strong>No asset selected</strong><p>Refresh to load the local market universe.</p></section>'}<div class="signals-context">${item ? scorePanel(item) + compactNews(item.kind === 'signal' ? item.signal.symbol : item.asset.symbol) : ''}</div></div>`
  }

  function filteredNews() {
    const query = ui.newsQuery.trim().toLowerCase()
    return appState.news.filter(item => {
      const categoryMatch = ui.newsCategory === 'all' || item.category === ui.newsCategory
      const text = `${item.title} ${item.summary} ${item.tags.join(' ')}`.toLowerCase()
      return categoryMatch && (!query || text.includes(query))
    })
  }

  function newsResultsMarkup() {
    const items = filteredNews()
    if (!items.length) return '<div class="empty-state"><strong>No stories match</strong><p>Try a different keyword or topic. If the feed is empty, check publisher source health in Settings and refresh.</p></div>'
    return `<div class="news-list">${items.map(item => newsItem(item, true)).join('')}</div>`
  }

  function renderNews() {
    return `${viewHeader('Market news', 'Direct publisher RSS with source labels and original publication times.')}<div class="news-controls"><div class="search-field"><label for="news-search">Search news</label><input class="search-input" id="news-search" type="search" value="${escapeHtml(ui.newsQuery)}" placeholder="Try BTC, funding, or ETF" autocomplete="off"></div><div class="select-field"><label for="news-category">Topic</label><select class="select-input" id="news-category">${['all', 'markets', 'derivatives', 'projects', 'macro'].map(category => `<option value="${category}" ${ui.newsCategory === category ? 'selected' : ''}>${category === 'all' ? 'All topics' : category[0].toUpperCase() + category.slice(1)}</option>`).join('')}</select></div></div><div class="news-page-layout"><section class="panel" aria-labelledby="news-feed-title"><div class="panel-header"><h2 class="panel-title" id="news-feed-title">${icons.news}Publisher feed</h2><span class="panel-meta" id="news-count">${filteredNews().length} STORIES</span></div><div id="news-results">${newsResultsMarkup()}</div><p class="news-demo">Headlines and permitted feed summaries only. Articles open at the original publisher.</p></section><aside class="panel" aria-labelledby="news-guide-title"><div class="panel-header"><h2 class="panel-title" id="news-guide-title">Context, not noise</h2></div><div class="news-side-list"><div class="news-side-item"><strong>Source first</strong><span>Every story identifies its publisher and publication time.</span></div><div class="news-side-item"><strong>Connected to your terminal</strong><span>Asset tags bring relevant coverage into the signal workspace.</span></div><div class="news-side-item"><strong>Separate from the model</strong><span>News never changes an entry score or suppresses a loss.</span></div></div></aside></div>`
  }

  function renderCalendar() {
    const events = appState.events
    const importButton = label => `<button class="button button-primary" type="button" data-action="import-calendar" ${!canUseLiveFeatures() ? 'disabled' : ''}>${label}</button>`
    return `${viewHeader('Market calendar', 'Your imported economic and project calendars, stored locally.', importButton('Import .ics'))}<section class="panel" aria-labelledby="calendar-title"><div class="panel-header"><h2 class="panel-title" id="calendar-title">Upcoming events</h2><span class="panel-meta">${events.length} EVENTS · UTC</span></div>${events.length ? `<div class="calendar-list">${events.map(event => `<article class="calendar-day"><div class="calendar-date"><strong>${new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(new Date(event.start))}</strong><span>${new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(new Date(event.start)).toUpperCase()}</span></div><div class="event-list"><div class="event"><time class="event-time">${event.allDay ? 'ALL DAY' : formatTime(event.start)}</time><div><h3 class="event-title">${escapeHtml(event.summary)}</h3><p class="event-meta">${escapeHtml(event.source)}${event.description ? ` · ${escapeHtml(event.description.slice(0, 160))}` : ''}</p></div><span class="badge badge-blue">ICS</span></div></div></article>`).join('')}</div>` : `<div class="empty-state"><strong>No calendar imported</strong><p>Import a standard .ics file from an economic-calendar or project-events provider you trust. No event dates are invented or fetched from T365.</p>${importButton('Choose an .ics file')}</div>`}</section>`
  }

  function renderSettings() {
    const licence = appState.license
    const active = licence.status === 'active'
    const expired = licence.status === 'expired'
    const trialDays = Math.max(0, Math.ceil((Date.parse(licence.trialEndsAt) - Date.now()) / 864e5))
    const statusLabel = active ? 'Perpetual licence active · all major versions' : expired ? 'Trial ended' : licence.status === 'unconfigured' ? `Trial active · ${trialDays} days left` : `Trial · ${trialDays} days left`
    return `${viewHeader('Settings & ownership', 'Local data, public sources, offline licensing, and backup controls.')}<div class="settings-grid">
      <section class="panel settings-hero"><div><span class="eyebrow gold">Local-first application</span><h2>Your terminal. Yours to keep.</h2><p>The scanner runs on this computer. Your watchlist, alert preferences, signals, licence, and imported calendars stay in the local data file below.</p></div><div class="licence-seal"><strong>${active ? 'PERPETUAL' : expired ? 'TRIAL ENDED' : 'LOCAL V1'}</strong><span>${escapeHtml(licence.status.toUpperCase())}</span></div></section>
      <section class="panel"><div class="panel-header"><h2 class="panel-title">Licence & trial</h2><span class="badge ${active ? 'badge-bullish' : expired ? 'badge-short' : 'badge-gold'}">${escapeHtml(licence.status)}</span></div><div class="panel-body"><p class="settings-status">${escapeHtml(statusLabel)}</p><dl class="settings-list"><div class="setting-row"><dt>Licence ID</dt><dd>${escapeHtml(licence.licenseId ?? 'Not activated')}</dd></div><div class="setting-row"><dt>Support until</dt><dd>${licence.updatesUntil ? `${formatTime(licence.updatesUntil, true)} UTC` : 'Perpetual use after activation'}</dd></div>${!active ? `<div class="setting-row"><dt>Trial ends</dt><dd>${formatTime(licence.trialEndsAt, true)} UTC</dd></div>` : ''}</dl>${!active ? `<label class="licence-label" for="license-key">Offline licence key</label><input class="search-input licence-input" id="license-key" type="text" placeholder="Paste your T365D1 licence key" autocomplete="off" spellcheck="false"><button class="button button-primary activate-button" type="button" data-action="activate-license" ${activationInFlight ? 'disabled' : ''}>${activationInFlight ? 'Activating…' : 'Activate offline'}</button>` : ''}<p class="settings-note">Activation is verified on this computer. No activation server is contacted. Support expiry never disables the app or removes access to future major versions.</p></div></section>
      <section class="panel"><div class="panel-header"><h2 class="panel-title">Application & backup</h2></div><dl class="settings-list"><div class="setting-row"><dt>Version</dt><dd>${escapeHtml(appState.appVersion)}</dd></div><div class="setting-row"><dt>Local data file</dt><dd>${escapeHtml(appState.dataFile)}</dd></div><div class="setting-row"><dt>Last completed refresh</dt><dd>${appState.lastUpdated ? `${formatTime(appState.lastUpdated, true)} UTC` : 'Never'}</dd></div><div class="setting-row"><dt>Watchlist assets</dt><dd>${appState.watchlist.length}</dd></div><div class="setting-row"><dt>Signal alert preferences</dt><dd>${appState.alertedSignalIds.length}</dd></div></dl><div class="panel-body"><button class="button button-primary" type="button" data-action="export-backup">Export JSON backup</button><p class="settings-note">Backup export writes a copy to a location you choose. Restore is not included in v1.</p></div></section>
      <section class="panel"><div class="panel-header"><h2 class="panel-title">Source health</h2><span class="panel-meta">LIVE + CACHED</span></div>${appState.sources.length ? appState.sources.map(source => `<div class="connection-card"><span class="status-dot ${source.status !== 'ok' ? 'is-degraded' : ''}" aria-hidden="true"></span><div><strong>${escapeHtml(source.label)}</strong><span>${source.lastSuccess ? `Last success ${relativeTime(source.lastSuccess)}` : 'No successful response yet'}${source.message ? ` · ${escapeHtml(source.message)}` : ''}</span></div><span class="badge ${source.status === 'ok' ? 'badge-bullish' : 'badge-gold'}">${escapeHtml(source.status)}</span></div>`).join('') : '<div class="empty-state"><strong>No provider responses yet</strong><p>Refresh to initialize public-data sources. Failed first launches are shown here without cached-success claims.</p></div>'}</section>
    </div>`
  }

  function updateBanner() {
    if (!updateInfo) return ''
    return `<div class="banner banner-update"><div class="banner-text"><strong>Update available.</strong><span>T365 Terminal ${escapeHtml(updateInfo.latestVersion)} is ready — you are on ${escapeHtml(updateInfo.currentVersion)}.</span></div><button class="banner-cta" type="button" data-action="open-update">Download update →</button></div>`
  }

  function licenceBanner() {
    const licence = appState?.license
    if (!licence) return ''
    if (licence.status === 'expired') {
      return `<div class="banner banner-licence is-expired"><div class="banner-text"><strong>Trial ended.</strong><span>Live scanning, watchlists, and alerts are paused. Your cached data stays available.</span></div><button class="banner-cta" type="button" data-action="goto-license">Activate licence →</button></div>`
    }
    if (licence.status === 'trial') {
      const days = Math.max(0, Math.ceil((Date.parse(licence.trialEndsAt) - Date.now()) / 864e5))
      if (days <= 2) return `<div class="banner banner-licence is-trial"><div class="banner-text"><strong>Trial ending.</strong><span>${days <= 0 ? 'Your trial ends today' : `${days} day${days === 1 ? '' : 's'} left`} · live scanning pauses when it ends.</span></div><button class="banner-cta" type="button" data-action="goto-license">Activate licence →</button></div>`
    }
    return ''
  }

  function renderBanners() {
    if (!appBanners) return
    appBanners.innerHTML = updateBanner() + licenceBanner()
  }

  function render() {
    if (!appState) return
    const views = { overview: renderOverview, signals: renderSignals, news: renderNews, calendar: renderCalendar, settings: renderSettings }
    selectedItem()
    renderBanners()
    appView.innerHTML = views[ui.view]()
    document.querySelectorAll('.nav-item[data-view]').forEach(button => {
      const active = button.dataset.view === ui.view
      button.classList.toggle('is-active', active)
      if (active) button.setAttribute('aria-current', 'page')
      else button.removeAttribute('aria-current')
    })
    signalCount.textContent = String(openSignals().length)
    engineStatus.textContent = appState.phase === 'refreshing' ? 'Refreshing public providers…' : `${appState.phase === 'degraded' ? 'Degraded / cached' : 'Local'} · updated ${relativeTime(appState.lastUpdated)}`
    engineDot.classList.toggle('is-degraded', appState.phase === 'degraded')
    document.title = `${ui.view[0].toUpperCase() + ui.view.slice(1)} — T365 Terminal`
  }

  function setView(view) {
    if (!['overview', 'signals', 'news', 'calendar', 'settings'].includes(view)) return
    ui.view = view
    render()
    window.scrollTo(0, 0)
    appView.focus({ preventScroll: true })
  }

  function updateNewsResults() {
    const results = document.querySelector('#news-results')
    const count = document.querySelector('#news-count')
    if (results) results.innerHTML = newsResultsMarkup()
    if (count) count.textContent = `${filteredNews().length} STORIES`
  }

  async function refresh() {
    if (!canUseLiveFeatures()) { showToast('Your trial has ended. Activate T365 Terminal in Settings to resume live scanning.'); return }
    if (refreshInFlight) return
    refreshInFlight = true
    render()
    try {
      appState = await window.t365.refresh()
      showToast(appState.message || 'Local refresh complete.')
    } catch (error) { showToast(`Refresh failed: ${error.message}`) }
    finally { refreshInFlight = false; render() }
  }

  async function activateLicense() {
    if (activationInFlight) return
    const input = document.querySelector('#license-key')
    const key = input?.value.trim()
    if (!key) { showToast('Paste your T365D1 licence key first.'); return }
    activationInFlight = true
    render()
    try {
      appState = await window.t365.activateLicense(key)
      showToast('T365 Terminal is activated. Your perpetual licence is stored locally.')
    } catch (error) { showToast(`Activation failed: ${error.message}`) }
    finally { activationInFlight = false; render() }
  }

  async function setupPartners() {
    const card = document.querySelector('#partner-card')
    const partners = await window.t365.getPartners().catch(() => [])
    if (!card || !partners.length) { card?.remove(); return }
    const label = document.querySelector('#partner-label')
    const name = document.querySelector('#partner-name')
    const offer = document.querySelector('#partner-offer')
    const visit = document.querySelector('#partner-visit')
    const dots = document.querySelector('#partner-dots')
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let activeIndex = 0
    let rotationTimer

    dots.innerHTML = partners.map((partner, index) => `<button class="partner-dot" type="button" data-partner-index="${index}" aria-label="Show ${escapeHtml(partner.name)} offer"></button>`).join('')
    const dotButtons = [...dots.querySelectorAll('[data-partner-index]')]

    function showPartner(index) {
      activeIndex = (index + partners.length) % partners.length
      const partner = partners[activeIndex]
      label.textContent = partner.label
      name.textContent = partner.name
      offer.textContent = partner.offer
      visit.textContent = `Visit ${partner.name} →`
      visit.dataset.partner = partner.id
      dotButtons.forEach((button, buttonIndex) => {
        const active = buttonIndex === activeIndex
        button.classList.toggle('is-active', active)
        button.setAttribute('aria-pressed', String(active))
      })
    }

    function stopRotation() {
      clearInterval(rotationTimer)
      rotationTimer = undefined
    }

    function startRotation() {
      stopRotation()
      if (!reducedMotion.matches && !document.hidden) {
        rotationTimer = setInterval(() => showPartner(activeIndex + 1), 8000)
      }
    }

    dotButtons.forEach(button => button.addEventListener('click', () => {
      showPartner(Number(button.dataset.partnerIndex))
      startRotation()
    }))
    card.addEventListener('mouseenter', stopRotation)
    card.addEventListener('mouseleave', startRotation)
    card.addEventListener('focusin', stopRotation)
    card.addEventListener('focusout', event => {
      if (!card.contains(event.relatedTarget)) startRotation()
    })
    document.addEventListener('visibilitychange', () => document.hidden ? stopRotation() : startRotation())
    reducedMotion.addEventListener('change', startRotation)
    showPartner(0)
    startRotation()
  }

  document.addEventListener('click', event => {
    const viewButton = event.target.closest('[data-view]')
    if (viewButton) { setView(viewButton.dataset.view); return }
    const keyButton = event.target.closest('[data-key]')
    if (keyButton) { ui.selectedKey = keyButton.dataset.key; render(); return }
    const filterButton = event.target.closest('[data-filter]')
    if (filterButton) { ui.directionFilter = filterButton.dataset.filter; render(); return }
    const newsTag = event.target.closest('[data-news-tag]')
    if (newsTag) {
      if (newsTag.dataset.newsKind === 'topic') {
        ui.newsCategory = newsTag.dataset.newsTag
        ui.newsQuery = ''
      } else {
        ui.newsCategory = 'all'
        ui.newsQuery = newsTag.dataset.newsTag
      }
      setView('news')
      return
    }
    const partnerButton = event.target.closest('[data-partner]')
    if (partnerButton) { void window.t365.openPartner(partnerButton.dataset.partner).catch(error => showToast(error.message)); return }
    const urlButton = event.target.closest('[data-url]')
    if (urlButton) { void window.t365.openExternal(urlButton.dataset.url).catch(error => showToast(error.message)); return }
    const watchButton = event.target.closest('[data-watch]')
    if (watchButton) {
      const symbol = watchButton.dataset.watch
      void window.t365.toggleWatchlist(symbol).then(state => { appState = state; render(); showToast(`${symbol} watchlist preference saved locally.`) }).catch(error => showToast(error.message))
      return
    }
    const alertButton = event.target.closest('[data-alert]')
    if (alertButton) {
      const id = alertButton.dataset.alert
      void window.t365.toggleAlert(id).then(state => { appState = state; render(); showToast('Native alert preference saved locally.') }).catch(error => showToast(error.message))
      return
    }
    const action = event.target.closest('[data-action]')?.dataset.action
    if (action === 'refresh') { void refresh(); return }
    if (action === 'activate-license') { void activateLicense(); return }
    if (action === 'open-update') { void window.t365.openUpdate().catch(error => showToast(error.message)); return }
    if (action === 'goto-license') {
      setView('settings')
      requestAnimationFrame(() => {
        const input = document.querySelector('#license-key')
        input?.scrollIntoView({ block: 'center' })
        input?.focus({ preventScroll: true })
      })
      return
    }
    if (action === 'import-calendar') {
      void window.t365.importCalendar().then(state => { appState = state; render(); showToast(state.message || 'Calendar import complete.') }).catch(error => showToast(error.message))
      return
    }
    if (action === 'export-backup') {
      void window.t365.exportBackup().then(result => showToast(result.saved ? `Backup exported to ${result.path}` : 'Backup export cancelled.')).catch(error => showToast(error.message))
    }
  })

  appView.addEventListener('input', event => {
    if (event.target.id === 'news-search') { ui.newsQuery = event.target.value; updateNewsResults() }
  })
  appView.addEventListener('change', event => {
    if (event.target.id === 'news-category') { ui.newsCategory = event.target.value; updateNewsResults() }
  })

  void setupPartners()
  void window.t365.getUpdate().then(info => { updateInfo = info; renderBanners() }).catch(() => {})
  window.t365.onUpdate(info => { updateInfo = info; renderBanners() })
  window.t365.onState(state => { appState = state; render() })
  window.t365.getState().then(state => { appState = state; render() }).catch(error => {
    appView.innerHTML = `<section class="panel empty-state"><strong>Could not read local state</strong><p>${escapeHtml(error.message)}</p></section>`
  })
  setInterval(() => { document.querySelector('#utc-clock').textContent = `UTC ${new Date().toISOString().slice(11, 16)}` }, 1000)
})()
