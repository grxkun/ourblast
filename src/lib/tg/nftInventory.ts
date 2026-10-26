// SPDX-License-Identifier: BUSL-1.1
export const NFT_RECIPIENT = /^(0x[0-9a-f]{64}|[a-z0-9-]+(\.[a-z0-9-]+)*\.sui|@[a-z0-9_]{1,15})$/i;

export function nftCollectionKey(nft: { type: string }): string {
  return nft.type;
}

export function nftSendCommand(id: string, recipient: string): string | null {
  const to = recipient.trim();
  if (!/^0x[0-9a-f]{64}$/i.test(id) || !NFT_RECIPIENT.test(to)) return null;
  return `send nft ${id} to ${to}`;
}

export function visibleNfts<T extends { type: string }>(nfts: T[], hidden: string[], showHidden: boolean): T[] {
  return nfts.filter((n) => hidden.includes(nftCollectionKey(n)) === showHidden);
}