import { parseModule, readUleb } from "../src/lib/terminal/coin-template.server";
const b64 = (await import("node:fs")).readFileSync("/tmp/tmpl.txt","utf8").trim();
const bytes = new Uint8Array(Buffer.from(b64,"base64"));
const p = parseModule(bytes);
console.log("tables", p.tables, "bodyLen", p.body.length);
const t = p.tables.find(x=>x.kind===7)!;
const c = {offset:t.offset};
const count = Number(readUleb(p.body,c));
console.log("count",count,"tableOff",t.offset,"len",t.length);
for (let i=0;i<count;i++){const l=Number(readUleb(p.body,c));console.log(i,l,Buffer.from(p.body.slice(c.offset,c.offset+l)).toString("utf8"));c.offset+=l;}
console.log("end",c.offset,"expected",t.offset+t.length);
