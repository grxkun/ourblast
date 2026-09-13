export type CityBuilding = {
  id: string;
  building_type: string;
  building_level: number;
  district_key: string;
  position_x: number;
  position_y: number;
  builder_repositories?: {
    name: string;
    full_name?: string | null;
    owner?: string | null;
    sui_relevance: number;
    description: string | null;
  } | null;
};

export type CityCameraCommand =
  | { id: number; type: "rotate"; amount: number }
  | { id: number; type: "zoom"; amount: number }
  | { id: number; type: "preset"; preset: "helicopter" | "isometric" };

export type BuilderCitySceneProps = {
  buildings: CityBuilding[];
  username: string;
  level: number;
  interactive: boolean;
  selectedId?: string;
  profileEnabled: boolean;
  onSelect: (building: CityBuilding) => void;
  onOpenProfile: () => void;
  cameraCommand?: CityCameraCommand;
  visibleLevel?: number | null;
};