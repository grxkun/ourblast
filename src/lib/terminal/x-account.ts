// SPDX-License-Identifier: BUSL-1.1
export interface XAccount {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface XAccountConnector {
  getAccount(): Promise<XAccount | null>;
  connect(): Promise<XAccount>;
  disconnect(): Promise<void>;
}

export const unavailableXConnector: XAccountConnector = {
  async getAccount() {
    return null;
  },
  async connect() {
    throw new Error("X connection is coming soon / not connected.");
  },
  async disconnect() {},
};