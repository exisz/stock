const $ = (id) => document.getElementById(id);

let DATA = null;
let MAP = new Map();
let HEAT_STATE = null;

function mid(q) {
  return q && Number.isFinite(q.bid) && Number.isFinite(q.ask) ? (q.bid + q.ask) / 2 : NaN;
}

function money(x) {
  return (x < 0 ? "-" : "") + "$" + Math.abs(x).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function px(x) {
  return Number.isFinite(x) ? "$" + Number(x).toFixed(2) : "—";
}

function opt(strike, type) {
  const row = MAP.get(Number(strike));
  return row ? row[type] : null;
}

function legMid(strike, type) {
  return mid(opt(strike, type));
}

function comboQuote(c) {
  const bp = opt(c.putBuy, "put");
  const sp = opt(c.putSell, "put");
  const bc = opt(c.callBuy, "call");
  const sc = opt(c.callSell, "call");
  if (!bp || !sp || !bc || !sc) return null;

  return {
    bid: bp.bid - sp.ask + bc.bid - sc.ask,
    mid: legMid(c.putBuy, "put") - legMid(c.putSell, "put") + legMid(c.callBuy, "call") - legMid(c.callSell, "call"),
    ask: bp.ask - sp.bid + bc.ask - sc.bid,
  };
}

function payoffValue(S, c) {
  return Math.max(c.putBuy - S, 0) - Math.max(c.putSell - S, 0)
    + Math.max(S - c.callBuy, 0) - Math.max(S - c.callSell, 0);
}

function selectedCombo() {
  return {
    putBuy: Number($("putBuy").value),
    putSell: Number($("putSell").value),
    callBuy: Number($("callBuy").value),
    callSell: Number($("callSell").value),
  };
}

function selectedDebit(q) {
  const override = $("debitOverride").value;
  return override !== "" && !Number.isNaN(Number(override)) ? Number(override) : q.mid;
}

function evaluate(c, debitMode = "mid") {
  const q = comboQuote(c);
  if (!q) return null;

  const debit = debitMode === "selected" ? selectedDebit(q) : q.mid;
  const lots = Number($("lots").value || 1);
  const downTarget = Number($("downTarget").value);
  const upTarget = Number($("upTarget").value);
  const downVal = payoffValue(downTarget, c);
  const upVal = payoffValue(upTarget, c);
  const downProfit = downVal - debit;
  const upProfit = upVal - debit;
  const minProfit = Math.min(downProfit, upProfit);
  const avgWinVal = (downVal + upVal) / 2;

  return {
    c,
    q,
    debit,
    lots,
    downVal,
    upVal,
    downProfit,
    upProfit,
    minProfit,
    lowerBE: c.putBuy - debit,
    upperBE: c.callBuy + debit,
    minRR: minProfit / debit,
    pNeeded: avgWinVal > 0 ? debit / avgWinVal : null,
  };
}

function verdict(e) {
  if (!e) return ["bad", "—"];
  if (e.minProfit <= 0) return ["bad", "One side does not profit"];
  if (e.minRR < 0.35) return ["bad", "Poor reward/risk"];
  if (e.minRR < 0.65) return ["warn", "Possible but weak"];
  if (e.minRR < 1) return ["warn", "Acceptable only if thesis is strong"];
  return ["good", "Good convexity"];
}

function setCombo(c) {
  $("putBuy").value = c.putBuy;
  $("putSell").value = c.putSell;
  $("callBuy").value = c.callBuy;
  $("callSell").value = c.callSell;
  $("debitOverride").value = "";
  renderSelected();
}

window.setCombo = setCombo;

function renderSelected() {
  const c = selectedCombo();
  const e = evaluate(c, "selected");
  if (!e) return;

  const mult = 100 * e.lots;
  const v = verdict(e);
  $("qLine").textContent = `${e.q.bid.toFixed(2)} / ${e.q.mid.toFixed(2)} / ${e.q.ask.toFixed(2)}`;
  $("maxLoss").textContent = money(e.debit * mult);
  $("downPL").textContent = money(e.downProfit * mult);
  $("downPL").className = "v " + (e.downProfit >= 0 ? "good" : "bad");
  $("upPL").textContent = money(e.upProfit * mult);
  $("upPL").className = "v " + (e.upProfit >= 0 ? "good" : "bad");
  $("beLine").textContent = `${px(e.lowerBE)} / ${px(e.upperBE)}`;
  $("rrLine").textContent = (e.minRR * 100).toFixed(0) + "%";
  $("probLine").textContent = e.pNeeded ? (e.pNeeded * 100).toFixed(0) + "%" : "—";
  $("verdict").textContent = v[1];
  $("verdict").className = "v " + v[0];
  $("explain").innerHTML = `BUY ${c.putBuy}P / SELL ${c.putSell}P + BUY ${c.callBuy}C / SELL ${c.callSell}C. Debit ${e.debit.toFixed(2)}. Target payoff values: downside ${e.downVal.toFixed(2)}, upside ${e.upVal.toFixed(2)}. Binary hit probability needed ≈ ${(e.pNeeded * 100).toFixed(1)}%.`;

  drawPayoff(e);
  drawHeat(e);
}

function drawPayoff(e) {
  const canvas = $("payoff");
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  const m = { l: 64, r: 20, t: 20, b: 34 };
  const pmin = Number($("pmin").value);
  const pmax = Number($("pmax").value);
  const pts = [];

  ctx.clearRect(0, 0, W, H);
  for (let i = 0; i <= 300; i++) {
    const S = pmin + ((pmax - pmin) * i) / 300;
    pts.push([S, (payoffValue(S, e.c) - e.debit) * 100 * e.lots]);
  }

  const ys = pts.map((p) => p[1]);
  const ymin = Math.min(...ys);
  const ymax = Math.max(...ys);
  const xmap = (S) => m.l + ((S - pmin) / (pmax - pmin)) * (W - m.l - m.r);
  const ymap = (y) => m.t + ((y - ymax) / (ymin - ymax)) * (H - m.t - m.b);

  ctx.strokeStyle = "#334155";
  ctx.strokeRect(m.l, m.t, W - m.l - m.r, H - m.t - m.b);
  ctx.strokeStyle = "#64748b";
  ctx.beginPath();
  ctx.moveTo(m.l, ymap(0));
  ctx.lineTo(W - m.r, ymap(0));
  ctx.stroke();

  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 2;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(xmap(p[0]), ymap(p[1])) : ctx.moveTo(xmap(p[0]), ymap(p[1]))));
  ctx.stroke();

  ctx.fillStyle = "#cbd5e1";
  ctx.font = "12px system-ui";
  [e.c.putSell, e.c.putBuy, e.c.callBuy, e.c.callSell].forEach((s) => {
    const x = xmap(s);
    ctx.strokeStyle = "#475569";
    ctx.beginPath();
    ctx.moveTo(x, m.t);
    ctx.lineTo(x, H - m.b);
    ctx.stroke();
    ctx.fillText(String(s), x - 10, H - 12);
  });
  ctx.fillText(money(ymax), 8, ymap(ymax) + 4);
  ctx.fillText("$0", 24, ymap(0) + 4);
  ctx.fillText(money(ymin), 8, ymap(ymin) - 2);
}

function erf(x) {
  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  return sign * (1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-x * x));
}

function N(x) {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

function bsCall(S, K, T, r, sigma) {
  if (T <= 1e-7) return Math.max(S - K, 0);
  S = Math.max(S, 1e-9);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  return S * N(d1) - K * Math.exp(-r * T) * N(d2);
}

function bsPut(S, K, T, r, sigma) {
  if (T <= 1e-7) return Math.max(K - S, 0);
  S = Math.max(S, 1e-9);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  return K * Math.exp(-r * T) * N(-d2) - S * N(-d1);
}

function comboBS(S, T, c) {
  const r = Number($("rate").value) / 100;
  const sigma = Number($("iv").value) / 100;
  return bsPut(S, c.putBuy, T, r, sigma) - bsPut(S, c.putSell, T, r, sigma)
    + bsCall(S, c.callBuy, T, r, sigma) - bsCall(S, c.callSell, T, r, sigma);
}

function roiColor(roi) {
  if (roi <= -50) return "#7f1d1d";
  if (roi < 0) return "#f97316";
  if (roi < 50) return "#d9f99d";
  if (roi < 100) return "#86efac";
  return "#22c55e";
}

function actionText(roi) {
  if (roi < 0) return "亏损区：方向/时间还没兑现。";
  if (roi < 50) return "小赚：还未到明显止盈区。";
  if (roi < 100) return "止盈提醒：可考虑减仓。";
  return "大赚区：优先锁利润，不贪理论最大值。";
}

function drawHeat(e) {
  const canvas = $("heat");
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  const m = { l: 72, r: 24, t: 28, b: 42 };
  const today = new Date(DATA.asOf);
  const expiry = new Date(DATA.expiry + "T00:00:00");
  const totalYears = Math.max((expiry - today) / (365.25 * 24 * 3600 * 1000), 0.01);
  const pmin = Number($("pmin").value);
  const pmax = Number($("pmax").value);
  const nx = 150;
  const ny = 140;
  const plotW = W - m.l - m.r;
  const plotH = H - m.t - m.b;
  const cellW = plotW / nx;
  const cellH = plotH / ny;
  const cost = e.debit * 100 * e.lots;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0, 0, W, H);

  for (let ix = 0; ix < nx; ix++) {
    const fracX = ix / (nx - 1);
    const months = fracX * totalYears * 12;
    const T = Math.max(totalYears - months / 12, 1e-6);
    for (let iy = 0; iy < ny; iy++) {
      const fracY = iy / (ny - 1);
      const S = pmin + fracY * (pmax - pmin);
      const value = comboBS(S, T, e.c);
      const pnl = (value - e.debit) * 100 * e.lots;
      const roi = (pnl / cost) * 100;
      ctx.fillStyle = roiColor(roi);
      ctx.fillRect(m.l + ix * cellW, m.t + plotH - (iy + 1) * cellH, cellW + 0.7, cellH + 0.7);
    }
  }

  ctx.strokeStyle = "#334155";
  ctx.strokeRect(m.l, m.t, plotW, plotH);
  ctx.fillStyle = "#cbd5e1";
  ctx.font = "12px system-ui";

  [0, 3, 6, 12, 18, 24, Math.round(totalYears * 12)]
    .filter((x, i, a) => x >= 0 && x <= totalYears * 12 + 0.1 && a.indexOf(x) === i)
    .forEach((month) => {
      const x = m.l + (month / (totalYears * 12)) * plotW;
      ctx.strokeStyle = "rgba(229,231,235,.18)";
      ctx.beginPath();
      ctx.moveTo(x, m.t);
      ctx.lineTo(x, m.t + plotH);
      ctx.stroke();
      ctx.fillText(String(month), x - 6, H - 16);
    });

  const yTicks = [];
  for (let y = Math.ceil(pmin / 50) * 50; y <= pmax; y += 50) yTicks.push(y);
  [DATA.underlyingPrice, e.c.putSell, e.c.putBuy, e.c.callBuy, e.c.callSell].forEach((y) => {
    if (y >= pmin && y <= pmax) yTicks.push(y);
  });
  [...new Set(yTicks.map((x) => Number(x.toFixed(2))))].sort((a, b) => a - b).forEach((y) => {
    const yy = m.t + plotH - ((y - pmin) / (pmax - pmin)) * plotH;
    ctx.strokeStyle = "rgba(229,231,235,.15)";
    ctx.beginPath();
    ctx.moveTo(m.l, yy);
    ctx.lineTo(m.l + plotW, yy);
    ctx.stroke();
    ctx.fillStyle = "#cbd5e1";
    ctx.fillText(String(y), 28, yy + 4);
  });

  ctx.fillText("Months", m.l + plotW / 2 - 20, H - 8);
  ctx.save();
  ctx.translate(16, m.t + plotH / 2 + 40);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("SPCX price", 0, 0);
  ctx.restore();

  HEAT_STATE = { e, m, plotW, plotH, totalYears, pmin, pmax, today };
}

function heatHover(ev) {
  if (!HEAT_STATE) return;
  const canvas = $("heat");
  const rect = canvas.getBoundingClientRect();
  const x = ((ev.clientX - rect.left) * canvas.width) / rect.width;
  const y = ((ev.clientY - rect.top) * canvas.height) / rect.height;
  const { e, m, plotW, plotH, totalYears, pmin, pmax, today } = HEAT_STATE;
  const tip = $("tip");

  if (x < m.l || x > m.l + plotW || y < m.t || y > m.t + plotH) {
    tip.style.display = "none";
    return;
  }

  const fracX = (x - m.l) / plotW;
  const fracY = 1 - (y - m.t) / plotH;
  const months = fracX * totalYears * 12;
  const T = Math.max(totalYears - months / 12, 1e-6);
  const S = pmin + fracY * (pmax - pmin);
  const value = comboBS(S, T, e.c);
  const pnl = (value - e.debit) * 100 * e.lots;
  const cost = e.debit * 100 * e.lots;
  const roi = (pnl / cost) * 100;
  const date = new Date(today.getTime() + months * 30.4375 * 24 * 3600 * 1000);

  tip.textContent = `Date: ${date.toISOString().slice(0, 10)}\nMonths: ${months.toFixed(1)}\nStock price: ${px(S)}\nCombo value: ${px(value)} / share\nEntry debit: ${px(e.debit)} / share\nP/L: ${money(pnl)}\nROI: ${roi.toFixed(1)}%\nAction: ${actionText(roi)}`;
  tip.style.display = "block";
  tip.style.left = Math.min(ev.clientX - rect.left + 18, rect.width - 380) + "px";
  tip.style.top = Math.max(8, ev.clientY - rect.top - 80) + "px";
}

function renderSuggested() {
  $("suggested").innerHTML = (DATA.suggestedStrategies || []).map((s) => {
    const e = evaluate(s.legs, "mid");
    const v = e ? verdict(e) : ["bad", "missing"];
    return `<div class="strategy"><b>${s.label}</b><div class="legs">${s.legs.putBuy}/${s.legs.putSell}P + ${s.legs.callBuy}/${s.legs.callSell}C</div><div class="small">mid ${e ? e.debit.toFixed(2) : "—"} · min P/L ${e ? money(e.minProfit * 100) : "—"} · ${v[1]}</div><div class="small">${s.limitIdea || ""}</div><button onclick='setCombo(${JSON.stringify(s.legs)})'>Load</button></div>`;
  }).join("");
}

function scan() {
  if (!DATA) return;
  const sellPut = Number($("sellPut").value);
  const sellCall = Number($("sellCall").value);
  const maxDebit = Number($("maxDebit").value);
  const minProfit = Number($("minProfit").value);
  const strikes = DATA.strikes.map((x) => x.strike).sort((a, b) => a - b);
  const rows = [];

  for (const putBuy of strikes.filter((x) => x > sellPut && x <= DATA.underlyingPrice + 10)) {
    for (const callBuy of strikes.filter((x) => x >= DATA.underlyingPrice && x < sellCall)) {
      const c = { putBuy, putSell: sellPut, callBuy, callSell: sellCall };
      const e = evaluate(c, "mid");
      if (!e) continue;
      if (e.debit <= maxDebit && e.downProfit >= minProfit && e.upProfit >= minProfit) rows.push(e);
    }
  }

  rows.sort((a, b) => (b.minRR - a.minRR) || (a.debit - b.debit));
  $("scanTable").innerHTML = `<thead><tr><th>Combo</th><th>Bid/Mid/Ask</th><th>Debit</th><th>≤Down P/L</th><th>≥Up P/L</th><th>Min R/R</th><th>P needed</th><th>Verdict</th></tr></thead><tbody>${rows.slice(0, 80).map((e) => {
    const v = verdict(e);
    return `<tr onclick='setCombo(${JSON.stringify(e.c)})'><td>${e.c.putBuy}/${e.c.putSell}P + ${e.c.callBuy}/${e.c.callSell}C</td><td>${e.q.bid.toFixed(2)} / ${e.q.mid.toFixed(2)} / ${e.q.ask.toFixed(2)}</td><td>${e.debit.toFixed(2)}</td><td class="${e.downProfit >= 0 ? "good" : "bad"}">${money(e.downProfit * 100)}</td><td class="${e.upProfit >= 0 ? "good" : "bad"}">${money(e.upProfit * 100)}</td><td>${(e.minRR * 100).toFixed(0)}%</td><td>${e.pNeeded ? (e.pNeeded * 100).toFixed(0) + "%" : "—"}</td><td class="${v[0]}">${v[1]}</td></tr>`;
  }).join("")}</tbody>`;

  $("insight").innerHTML = "当前截图里，25-wide 双边结构如果花 19-20 debit，只剩 5-6 点最大利润，收益/风险约 0.3，确实偏亏。能成交不等于值得买。更好的结构需要更宽的 wing、低得多的 debit，或者更强方向性。";
}

async function loadManifest() {
  const manifest = await fetch("data/manifest.json").then((r) => r.json());
  $("dataset").innerHTML = manifest.datasets.map((d) => `<option value="${d.file}">${d.label}</option>`).join("");
  await loadData();
}

async function loadData() {
  DATA = await fetch($("dataset").value).then((r) => r.json());
  MAP = new Map(DATA.strikes.map((x) => [x.strike, x]));
  $("meta").innerHTML = `<br>${DATA.symbol} · expiry ${DATA.expiry} · underlying ${DATA.underlyingPrice} · ${DATA.marketState}<br>${(DATA.notes || []).join("<br>")}`;

  ["putBuy", "putSell", "callBuy", "callSell"].forEach((id) => {
    $(id).innerHTML = DATA.strikes.map((x) => `<option value="${x.strike}">${x.strike}</option>`).join("");
  });

  $("iv").value = DATA.ivLastPct || 68;
  $("downTarget").value = DATA.defaultScan.downTarget;
  $("upTarget").value = DATA.defaultScan.upTarget;
  $("sellPut").value = DATA.defaultScan.sellPutStrike;
  $("sellCall").value = DATA.defaultScan.sellCallStrike;
  $("maxDebit").value = DATA.defaultScan.maxDebit;
  $("minProfit").value = DATA.defaultScan.minTargetProfit;

  const first = DATA.suggestedStrategies[0].legs;
  $("putBuy").value = first.putBuy;
  $("putSell").value = first.putSell;
  $("callBuy").value = first.callBuy;
  $("callSell").value = first.callSell;
  $("debitOverride").value = "";

  renderSuggested();
  renderSelected();
  scan();
}

["putBuy", "putSell", "callBuy", "callSell", "debitOverride", "lots", "iv", "rate", "pmin", "pmax", "downTarget", "upTarget"].forEach((id) => {
  $(id).addEventListener("input", renderSelected);
});
["sellPut", "sellCall", "maxDebit", "minProfit"].forEach((id) => {
  $(id).addEventListener("input", scan);
});

$("heat").addEventListener("mousemove", heatHover);
$("heat").addEventListener("mouseleave", () => { $("tip").style.display = "none"; });
$("rescan").addEventListener("click", scan);
$("dataset").addEventListener("change", loadData);

loadManifest();
