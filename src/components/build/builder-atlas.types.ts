export type IslandDeveloper = {
  id: string;
  username: string;
  avatarUrl: string | null;
  githubUrl: string;
  score: number;
  projects: number;
  cityLevel: number;
  tier: string;
  registered: boolean;
};

export type IslandCameraCommand =
  | { id: number; type: "rotate"; amount: number }
  | { id: number; type: "zoom"; amount: number }
  | { id: number; type: "reset" }
  | { id: number; type: "focus"; index: number };
