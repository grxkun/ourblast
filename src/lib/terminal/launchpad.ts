/**
 * Single place that defines which launch platform the terminal and the X bot target.
 * Point this elsewhere and every card, reply and adapter follows.
 */
export interface LaunchpadConfig {
  id: string;
  label: string;
  site: string;
  network: "sui";
  /** Move package / factory object, filled in once the platform API is wired up. */
  factoryPackage: string | null;
  factoryObject: string | null;
  version: string | null;
}

export const LAUNCHPAD: LaunchpadConfig = {
  id: "suipump",
  label: "SuiPump",
  site: "https://suipump.org",
  network: "sui",
  factoryPackage: null,
  factoryObject: null,
  version: null,
};
