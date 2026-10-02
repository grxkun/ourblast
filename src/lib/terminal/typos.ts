// SPDX-License-Identifier: BUSL-1.1
/**
 * Repairs the keyword typos people make on phones ("tickrr", "deply", "nmae",
 * "recevier") so the parsers see the words they expect. Only command keywords
 * are touched — cashtags, @handles, links, addresses and numbers never change.
 */

const EXPLICIT: Record<string, string> = {
  nmae: "name", naem: "name", nsme: "name", nane: "name", mame: "name",
  tiker: "ticker", tikcer: "ticker", tickr: "ticker", tickrr: "ticker", tkr: "ticker", ticke: "ticker",
  deply: "deploy", depoly: "deploy", dpeloy: "deploy", deplyo: "deploy", delpoy: "deploy", deplot: "deploy", dploy: "deploy", deploi: "deploy",
  lauch: "launch", lanch: "launch", luanch: "launch", launh: "launch", laucnh: "launch",
  craete: "create", creat: "create", ceate: "create",
  fe: "fee", fess: "fees", feee: "fee", feez: "fees",
  recevier: "receiver", reciever: "receiver", receiever: "receiver", recever: "receiver", reciver: "receiver",
  webiste: "website", wesbite: "website", websit: "website", webste: "website",
  telgram: "telegram", telegarm: "telegram", telegam: "telegram",
  twiter: "twitter", twitr: "twitter",
  desciption: "description", descripton: "description", discription: "description", decription: "description",
  imgae: "image", imge: "image", iamge: "image",
  supplly: "supply", suply: "supply",
  wirh: "with", wiht: "with", wth: "with",
};

const KEYWORDS = [
  "deploy", "launch", "create", "ticker", "symbol", "website", "telegram", "twitter",
  "receiver", "recipient", "description", "image", "supply", "liquidity", "paired",
];

function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) best = Math.min(best, d[i - 2]![j - 2]! + 1);
      d[i]![j] = best;
    }
  }
  return d[a.length]![b.length]!;
}

function fixWord(word: string): string {
  const lower = word.toLowerCase();
  if (EXPLICIT[lower]) return EXPLICIT[lower]!;
  if (lower.length < 5 || KEYWORDS.includes(lower)) return word;
  for (const keyword of KEYWORDS) {
    if (keyword[0] === lower[0] && distance(lower, keyword) === 1) return keyword;
  }
  return word;
}

/** Fixes keyword typos in place; everything else in the text is kept as written. */
export function fixTypos(text: string): string {
  // A bare word: letters only, not glued to $, @, /, ., ::, digits or another word.
  return text.replace(/(?<![$@/\w.:-])([a-z]+)(?![\w/@]|\.[a-z]|::)/gi, (word) => fixWord(word));
}
