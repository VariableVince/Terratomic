import { GameConfig, GameID, GameRecord } from "../core/Schemas";

let _startTime: number;

// Track game start time for duration calculation in GameRecord.
// Also clears stack count settings so each game starts fresh.
export function startGame(id: GameID, lobby: Partial<GameConfig>) {
  if (localStorage === undefined) {
    return;
  }

  // Clear stack count settings so each game starts fresh
  localStorage.removeItem("buildSettings.stackCount");

  _startTime = Date.now();
}

export function startTime() {
  return _startTime;
}

// No-op: GameRecord is passed directly to WinModal in ClientGameRunner.
// This function exists to maintain API compatibility.
// localStorage saving was removed because the data was never read (see commit history).
export function endGame(gameRecord: GameRecord) {
  // Intentionally empty
}
