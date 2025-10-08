export enum Role {
  TANK = 'Tank',
  HEALER = 'Healer',
  DPS = 'DPS',
}

export interface TimeSlot {
  start: number; // in minutes from midnight
  end: number;   // in minutes from midnight
}

export type Availability = {
  [day: string]: TimeSlot[];
};

export interface Player {
  id: string;
  name: string;
  roles: Role[];
  timezone: string; // IANA timezone, e.g., 'America/New_York'
  availability: Availability;
  notes?: string;
  board?: string; // board slug this player belongs to
  clientId?: string; // owner id (local browser)
}

export interface Match {
  day: string;
  start: number;
  end: number;
  players: Player[];
}
