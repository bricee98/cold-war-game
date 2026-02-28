import { GameApp } from "@/components/GameApp";
import { GameStoreProvider } from "@/lib/gameStore";

export default function Home() {
  return (
    <GameStoreProvider>
      <GameApp />
    </GameStoreProvider>
  );
}
