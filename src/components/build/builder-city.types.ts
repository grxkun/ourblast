export type CityBuilding = {
  id: string;
  building_type: string;
  building_level: number;
  district_key: string;
  position_x: number;
  position_y: number;
  builder_repositories?: {
    name: string;
    sui_relevance: number;
    description: string | null;
  } | null;
};

export type BuilderCitySceneProps = {
  buildings: CityBuilding[];
  username: string;
  level: number;
  interactive: boolean;
  selectedId?: string;
  onSelect: (building: CityBuilding) => void;
  onOpenProfile: () => void;
};