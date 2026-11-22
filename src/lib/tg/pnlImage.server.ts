// SPDX-License-Identifier: BUSL-1.1
/** Draws the exit-card numbers onto the user's PnL background (QuickChart). Returns null on failure so callers fall back to the plain background. */
export async function renderPnlImage(card: string, bgUrl: string): Promise<string | null> {
  const first = (card.split("\n")[0] ?? "").replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "").trim();
  const parts = first.split(" · ").map((s) => s.replace(/−/g, "-").trim()).filter(Boolean);
  if (parts.length < 3) return null;
  const win = !/exit/i.test(parts[0]!);
  const lines = [parts[0]!, "", parts[1]!, "", parts.slice(2).join(" · "), "", "OURBLAST · t.me/ourblastsuibot"];
  const chart = `({type:"scatter",data:{datasets:[{data:[{x:5,y:5}],pointRadius:0}]},options:{legend:{display:false},
plugins:{backgroundImageUrl:${JSON.stringify(bgUrl)},datalabels:{display:true,align:"center",anchor:"center",color:"#ffffff",
backgroundColor:"rgba(11,15,23,0.88)",borderColor:${JSON.stringify(win ? "#22c55e" : "#ef4444")},borderWidth:3,borderRadius:16,
padding:{top:24,bottom:24,left:32,right:32},font:{size:28,weight:"bold",family:"sans-serif"},formatter:()=>${JSON.stringify(lines)}}},
scales:{xAxes:[{display:false,ticks:{min:0,max:10}}],yAxes:[{display:false,ticks:{min:0,max:10}}]}}})`;
  const r = await fetch("https://quickchart.io/chart/create", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ version: "2", width: 900, height: 600, format: "png", chart }), signal: AbortSignal.timeout(8000) }).catch(() => null);
  const j = (await r?.json().catch(() => null)) as { success?: boolean; url?: string } | null;
  return j?.success && j.url ? j.url : null;
}
