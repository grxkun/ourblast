// SPDX-License-Identifier: BUSL-1.1
/** Resolve only recipient handles, never token names or mentions of the bot. */
export async function telegramRecipientCommand(
  text: string,
  resolve: (username: string) => Promise<string | null>,
): Promise<{ ok: true; text: string } | { ok: false; reply: string }> {
  const pattern = /\bto\s+@([a-z0-9_]+)(?=$|[\s.,!?;:)])/gi;
  const recipients = [...text.matchAll(pattern)];
  let rewritten = text;
  for (const match of recipients) {
    const username = match[1];
    if (!username || !/^[a-z0-9_]{4,32}$/i.test(username)) {
      return { ok: false, reply: "Invalid Telegram recipient username. Nothing was sent or traded." };
    }
    const address = await resolve(username);
    if (!address || !/^0x[0-9a-f]{64}$/i.test(address)) {
      return { ok: false, reply: `Telegram @${username} couldn't be resolved uniquely. Ask them to open @ourblastsuibot once and check their username. Nothing was sent or traded; I didn't look up an X account.` };
    }
    rewritten = rewritten.replace(match[0], `to ${address}`);
  }
  return { ok: true, text: rewritten };
}