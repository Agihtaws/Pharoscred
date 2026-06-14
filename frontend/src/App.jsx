import { useEffect, useState, useCallback } from "react";
import {
  CONFIG,
  fetchAgent,
  fetchLeaderboard,
  fetchAnchor,
  isAddress,
  shorten,
} from "./lib/pharos.js";

const pct = (bps) => Math.max(0, Math.min(100, bps / 100));

function AssayPanel({ agent, anchor }) {
  if (!agent) return null;
  const f = agent.factors;
  return (
    <div className="assay">
      <div className="assay-top">
        <div className="assay-id">
          <p className="lab">{agent.label || "Unregistered agent"}</p>
          <div className="addr">
            <a href={`${CONFIG.explorer}/address/${agent.address}`} target="_blank" rel="noreferrer">
              {agent.address}
            </a>
          </div>
        </div>
        <div className="readout">
          {agent.registered ? (
            <>
              <div className="num">{agent.score.toLocaleString()}</div>
              <div className="unit">/ 10,000 bps · {pct(agent.score).toFixed(2)}%</div>
            </>
          ) : (
            <span className="notreg">No on-chain record</span>
          )}
        </div>
      </div>

      <div className="scale">
        <div className="scale-track">
          <div className="ticks">
            {Array.from({ length: 20 }).map((_, i) => (
              <span key={i} />
            ))}
          </div>
          <div className="scale-fill" style={{ width: `${pct(agent.score)}%` }} />
        </div>
        <div className="scale-labels">
          <span>0</span><span>2,500</span><span>5,000</span><span>7,500</span><span>10,000 bps</span>
        </div>
      </div>

      <div className="factors">
        <div className="factor">
          <div className="fname">Success rate</div>
          <div className="fval">{f.successRate.toLocaleString()} <small style={{ color: "var(--ink-faint)" }}>bps</small></div>
          <div className="fbar"><i style={{ width: `${pct(f.successRate)}%` }} /></div>
          <div className="fnote">Share of settlements that succeeded.</div>
        </div>
        <div className="factor">
          <div className="fname">Activity</div>
          <div className="fval">{f.activity.toLocaleString()} <small style={{ color: "var(--ink-faint)" }}>bps</small></div>
          <div className="fbar"><i style={{ width: `${pct(f.activity)}%` }} /></div>
          <div className="fnote">Track-record depth, maxing out at 50 settlements.</div>
        </div>
        <div className="factor">
          <div className="fname">Breadth</div>
          <div className="fval">{f.breadth.toLocaleString()} <small style={{ color: "var(--ink-faint)" }}>bps</small></div>
          <div className="fbar"><i style={{ width: `${pct(f.breadth)}%` }} /></div>
          <div className="fnote">Distinct counterparties — the anti-sybil lever, caps at 10.</div>
        </div>
      </div>

      <div className="stats">
        <div className="stat"><div className="k">Settlements</div><div className="v">{agent.total}</div></div>
        <div className="stat"><div className="k">Successful</div><div className="v">{agent.successful}</div></div>
        <div className="stat"><div className="k">Partners</div><div className="v">{agent.distinctPartners}</div></div>
        <div className="stat"><div className="k">Volume</div><div className="v">{Number(agent.volumeUsdc).toLocaleString()} USDC</div></div>
      </div>

      {anchor && agent.registered && (
        <div className="cert">
          <span className="seal">State verified</span>
          <h4>Anchored to chain state</h4>
          <dl>
            <dt>Block</dt><dd>#{anchor.blockNumber.toLocaleString()}</dd>
            <dt>State root</dt><dd>{anchor.stateRoot}</dd>
            <dt>Code hash</dt><dd>{anchor.codeHash}</dd>
          </dl>
          <div className="foot">
            These values come from <span style={{ fontFamily: "var(--mono)" }}>eth_getProof</span> against the
            contract's storage — the same proof the <span style={{ fontFamily: "var(--mono)" }}>verify_score</span> tool
            returns per-slot. The score isn't asserted by a server; it's derived from state you can re-check yourself.
          </div>
        </div>
      )}
    </div>
  );
}

function Leaderboard({ rows, onPick }) {
  if (!rows.length) return <div className="skel">Loading leaderboard…</div>;
  return (
    <div className="lb">
      {rows.map((r) => (
        <div className="lb-row" key={r.address} onClick={() => onPick(r.address)}>
          <div className="lb-rank">{String(r.rank).padStart(2, "0")}</div>
          <div className="lb-id">
            <div className="l">{r.label || "Unregistered"}</div>
            <div className="a">{shorten(r.address)}</div>
          </div>
          <div className="lb-score">
            {r.score.toLocaleString()} <small>bps</small>
          </div>
          <div className="lb-bar"><i style={{ width: `${pct(r.score)}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [query, setQuery] = useState("");
  const [agent, setAgent] = useState(null);
  const [rows, setRows] = useState([]);
  const [anchor, setAnchor] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (addr) => {
    setError("");
    if (!isAddress(addr)) {
      setError("Enter a valid 0x… agent address.");
      return;
    }
    setBusy(true);
    try {
      const a = await fetchAgent(addr);
      setAgent(a);
    } catch (e) {
      setError(`Could not read that agent: ${e.message || e}`);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard(CONFIG.demoAgents)
      .then((lb) => {
        setRows(lb);
        if (lb[0]) return fetchAgent(lb[0].address).then(setAgent);
      })
      .catch(() => setError("Network unreachable. Check the RPC endpoint."));
    fetchAnchor().then(setAnchor).catch(() => {});
  }, []);

  return (
    <div className="wrap">
      <header className="topbar">
        <div className="mark">
          <span className="dot" />
          <span className="name">PHAROSCRED</span>
        </div>
        <a className="chip" href={`${CONFIG.explorer}/address/${CONFIG.contract}`} target="_blank" rel="noreferrer">
          Atlantic Testnet · Verified contract ↗
        </a>
      </header>

      <section className="hero">
        <p className="eyebrow">Provable agent credit</p>
        <h1>Credit that an agent can <em>prove</em>, not just claim.</h1>
        <p className="lede">
          PharosCred is an on-chain credit ledger for autonomous agents. Every score is computed from
          co-signed settlements and is cryptographically provable against Pharos state — a trust input any
          payment, escrow, or lending agent can compose with.
        </p>
        <div className="lookup">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load(query)}
            placeholder="0x… look up any agent address"
            spellCheck={false}
          />
          <button className="btn" onClick={() => load(query)} disabled={busy}>
            {busy ? "Reading…" : "Assay"}
          </button>
        </div>
        {error && <div className="msg">{error}</div>}
      </section>

      <section className="sec">
        <div className="sec-head">
          <h2>Credit assay</h2>
          <span className="tag">live · read directly from chain</span>
        </div>
        {agent ? <AssayPanel agent={agent} anchor={anchor} /> : <div className="skel">Loading agent…</div>}
      </section>

      <section className="sec">
        <div className="sec-head">
          <h2>Leaderboard</h2>
          <span className="tag">one MultiCall3 batch · tap a row to assay</span>
        </div>
        <Leaderboard rows={rows} onPick={load} />
      </section>

      <section className="sec">
        <div className="sec-head">
          <h2>How the score is computed</h2>
          <span className="tag">on-chain · 0–10,000 bps</span>
        </div>
        <div className="formula">
          <div className="eq">
            score = <b>success&nbsp;rate</b> × <b>activity</b> × <b>breadth</b>
          </div>
          <div className="notes">
            <div className="note">
              <div className="h">Success rate</div>
              <p>Successful settlements ÷ total. A clean record is necessary but, on its own, not sufficient.</p>
            </div>
            <div className="note">
              <div className="h">Activity</div>
              <p>Rewards a deeper track record, scaling up to 50 settlements before it saturates.</p>
            </div>
            <div className="note">
              <div className="h">Breadth</div>
              <p>Counts distinct counterparties, capped at 10. This is what stops an agent farming a high score by transacting with itself.</p>
            </div>
          </div>
        </div>
      </section>

      <footer className="foot">
        <div className="grid">
          <div className="item">
            <div className="k">Contract</div>
            <div className="v">
              <a href={`${CONFIG.explorer}/address/${CONFIG.contract}`} target="_blank" rel="noreferrer">
                {shorten(CONFIG.contract)} ↗
              </a>
            </div>
          </div>
          <div className="item"><div className="k">Chain</div><div className="v">Pharos Atlantic · {CONFIG.chainId}</div></div>
          <div className="item"><div className="k">RPC</div><div className="v">{CONFIG.rpc.replace("https://", "")}</div></div>
        </div>
        <p className="neutral">
          No admin key controls these scores. Records are written only with both counterparties' EIP-712
          signatures, and paid settlements move real USDC — so an agent's credit is something it earns, not
          something anyone can grant or revoke.
        </p>
      </footer>
    </div>
  );
}