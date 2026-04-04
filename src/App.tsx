import React, { useState, useEffect, useCallback, FormEvent, useMemo, Component, ReactNode, ErrorInfo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  Gamepad2, 
  Download, 
  Cpu, 
  User as UserIcon, 
  Globe, 
  ChevronLeft, 
  Star, 
  Monitor, 
  Layers,
  ArrowRight,
  Loader2,
  Plus,
  Users,
  AlertTriangle,
  Share2,
  Check,
  LogIn,
  LogOut
} from 'lucide-react';
import { Game, Language, translations } from './types';
import { getGameDetails } from './services/gemini';
import { POPULAR_GAMES_LIST } from './data/gamesList';
import { db, auth } from './firebase';
import { 
  doc, 
  onSnapshot, 
  runTransaction, 
  getDocFromServer,
  collection,
  setDoc,
  deleteDoc
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged,
  type User
} from 'firebase/auth';

// Error Handling Spec for Firestore Operations
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Error Boundary Component
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, error: Error | null }> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if ((this.state as any).hasError) {
      return (
        <div className="min-h-screen bg-black flex items-center justify-center p-4">
          <div className="glass-card p-8 max-w-md w-full text-center space-y-6 neon-border border-red-500/50">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="text-red-500" size={32} />
            </div>
            <h2 className="text-2xl font-black tracking-tighter text-white">SYSTEM FAILURE</h2>
            <p className="text-white/60 text-sm font-mono">
              {(this.state as any).error?.message.startsWith('{') 
                ? "A critical database error occurred. The nexus is currently unstable."
                : "An unexpected error occurred in the AetherNexus core."}
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-red-500 text-white font-bold rounded-xl hover:bg-red-600 transition-colors"
            >
              REBOOT SYSTEM
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

const GAMES_PER_PAGE = 24;

// Helper to generate a consistent player count based on title
const getPlayerCount = (title: string) => {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  const base = Math.abs(hash % 1000000);
  if (base > 500000) return (base / 1000).toFixed(1) + 'M';
  return (base / 1000).toFixed(1) + 'K';
};

// Map of real cover art for popular games
const POPULAR_COVERS: Record<string, string> = {
  "League of Legends": "https://upload.wikimedia.org/wikipedia/en/7/77/League_of_Legends_logo.png",
  "Minecraft": "https://upload.wikimedia.org/wikipedia/en/5/51/Minecraft_cover.png",
  "Fortnite": "https://upload.wikimedia.org/wikipedia/en/b/b1/Fortnite_Save_the_World_Box_Art.jpg",
  "Counter-Strike 2": "https://upload.wikimedia.org/wikipedia/en/f/f2/CS2_Cover_Art.jpg",
  "Roblox": "https://upload.wikimedia.org/wikipedia/en/3/3a/Roblox_logo.svg",
  "Valorant": "https://upload.wikimedia.org/wikipedia/en/f/fc/Valorant_cover_art.jpg",
  "Grand Theft Auto V": "https://upload.wikimedia.org/wikipedia/en/a/a5/Grand_Theft_Auto_V.png",
  "Apex Legends": "https://upload.wikimedia.org/wikipedia/en/d/db/Apex_legends_cover.jpg",
  "Genshin Impact": "https://upload.wikimedia.org/wikipedia/en/5/5d/Genshin_Impact_logo.png",
  "Elden Ring": "https://upload.wikimedia.org/wikipedia/en/b/b9/Elden_Ring_Box_art.jpg",
  "Cyberpunk 2077": "https://upload.wikimedia.org/wikipedia/en/9/9f/Cyberpunk_2077_box_art.jpg",
  "The Witcher 3: Wild Hunt": "https://upload.wikimedia.org/wikipedia/en/0/0b/Witcher_3_cover_art.jpg",
  "Red Dead Redemption 2": "https://upload.wikimedia.org/wikipedia/en/4/44/Red_Dead_Redemption_II.jpg",
  "Hades": "https://upload.wikimedia.org/wikipedia/en/c/cc/Hades_cover_art.jpg",
  "Call of Duty: Warzone": "https://www.callofduty.com/content/dam/atvi/callofduty/cod-touchui/warzone/home/WZ_Hero_Desktop.jpg",
  "Dota 2": "https://upload.wikimedia.org/wikipedia/en/0/0b/Dota_2_v6.79.png",
  "World of Warcraft": "https://upload.wikimedia.org/wikipedia/en/9/91/WoW_Box_Art1.jpg",
  "Rocket League": "https://cdn.akamai.steamstatic.com/steam/apps/252950/library_600x900_2x.jpg",
  "Among Us": "https://upload.wikimedia.org/wikipedia/en/9/9a/Among_Us_Icon.png",
  "Fall Guys": "https://cdn.akamai.steamstatic.com/steam/apps/1097150/library_600x900_2x.jpg",
  "Stardew Valley": "https://cdn.akamai.steamstatic.com/steam/apps/413150/library_600x900_2x.jpg",
  "Terraria": "https://upload.wikimedia.org/wikipedia/en/a/a3/Terraria_Box_Art.jpg",
  "Baldur's Gate 3": "https://upload.wikimedia.org/wikipedia/en/1/12/Baldur%27s_Gate_3_cover_art.jpg",
  "Doom (1993)": "https://cdn.akamai.steamstatic.com/steam/apps/2280/library_600x900_2x.jpg",
  "Doom II": "https://cdn.akamai.steamstatic.com/steam/apps/2300/library_600x900_2x.jpg",
  "Doom 3": "https://cdn.akamai.steamstatic.com/steam/apps/208200/library_600x900_2x.jpg",
  "Quake": "https://cdn.akamai.steamstatic.com/steam/apps/2310/library_600x900_2x.jpg",
  "Quake II": "https://cdn.akamai.steamstatic.com/steam/apps/2320/library_600x900_2x.jpg",
  "Quake III Arena": "https://cdn.akamai.steamstatic.com/steam/apps/2200/library_600x900_2x.jpg",
  "Half-Life": "https://cdn.akamai.steamstatic.com/steam/apps/70/library_600x900_2x.jpg",
  "Half-Life 2": "https://cdn.akamai.steamstatic.com/steam/apps/220/library_600x900_2x.jpg",
  "Portal": "https://cdn.akamai.steamstatic.com/steam/apps/400/library_600x900_2x.jpg",
  "Portal 2": "https://cdn.akamai.steamstatic.com/steam/apps/620/library_600x900_2x.jpg",
  "Super Mario Bros.": "https://upload.wikimedia.org/wikipedia/en/0/03/Super_Mario_Bros._box.png",
  "The Legend of Zelda": "https://upload.wikimedia.org/wikipedia/en/4/41/Legend_of_Zelda_Box_Art.png",
  "Metroid": "https://upload.wikimedia.org/wikipedia/en/5/5d/Metroid_box_art.jpg",
  "Pac-Man": "https://upload.wikimedia.org/wikipedia/en/0/03/Pac-man_pos_booklet_cover.png",
  "Tetris": "https://upload.wikimedia.org/wikipedia/en/4/4a/Tetris_Boxshot.jpg",
  "Street Fighter II": "https://upload.wikimedia.org/wikipedia/en/1/1d/SF2_SNES_box_art.jpg",
  "Mortal Kombat": "https://upload.wikimedia.org/wikipedia/en/b/b4/Mortal_Kombat_Coverart.png",
  "Sonic the Hedgehog": "https://upload.wikimedia.org/wikipedia/en/b/ba/Sonic_the_Hedgehog_1_Genesis_box_art.jpg",
  "Final Fantasy VII": "https://upload.wikimedia.org/wikipedia/en/c/c2/Final_Fantasy_VII_Box_Art.jpg",
  "Metal Gear Solid": "https://upload.wikimedia.org/wikipedia/en/3/33/Metal_Gear_Solid_cover_art.png",
  "Resident Evil": "https://upload.wikimedia.org/wikipedia/en/a/a6/Resident_Evil_1_cover.png",
  "Silent Hill": "https://upload.wikimedia.org/wikipedia/en/9/9e/Silent_Hill_1_cover.jpg",
  "Tomb Raider": "https://upload.wikimedia.org/wikipedia/en/b/bd/Tomb_Raider_1996_box_art.jpg",
  "Crash Bandicoot": "https://upload.wikimedia.org/wikipedia/en/4/44/Crash_Bandicoot_Cover.png",
  "Spyro the Dragon": "https://upload.wikimedia.org/wikipedia/en/5/53/Spyro_the_Dragon_PAL_box_art.jpg",
  "Halo: Combat Evolved": "https://upload.wikimedia.org/wikipedia/en/8/80/Halo_-_Combat_Evolved_%28XBox_Box_Art%29.jpg",
  "BioShock": "https://upload.wikimedia.org/wikipedia/en/6/6d/BioShock_cover.jpg",
  "The Last of Us": "https://upload.wikimedia.org/wikipedia/en/4/46/Video_Game_Cover_-_The_Last_of_Us.jpg",
  "God of War": "https://upload.wikimedia.org/wikipedia/en/a/a7/God_of_War_4_cover.jpg",
  "Uncharted 2: Among Thieves": "https://upload.wikimedia.org/wikipedia/en/b/b9/Uncharted_2_Among_Thieves_box_art.jpg",
  "Mass Effect": "https://upload.wikimedia.org/wikipedia/en/e/e8/MassEffect.jpg",
  "Skyrim": "https://upload.wikimedia.org/wikipedia/en/1/15/The_Elder_Scrolls_V_Skyrim_cover.png",
  "Fallout 4": "https://upload.wikimedia.org/wikipedia/en/7/70/Fallout_4_cover_art.jpg",
  "The Sims 4": "https://upload.wikimedia.org/wikipedia/en/7/7f/The_Sims_4_cover_art.jpg",
  "Minecraft Legends": "https://upload.wikimedia.org/wikipedia/en/4/45/Minecraft_Legends_cover_art.png",
  "Starfield": "https://upload.wikimedia.org/wikipedia/en/6/6d/Starfield_artwork.jpg",
  "Diablo IV": "https://upload.wikimedia.org/wikipedia/en/8/80/Diablo_IV_cover_art.png",
  "Street Fighter 6": "https://upload.wikimedia.org/wikipedia/en/5/5f/Street_Fighter_6_box_art.jpg",
  "Tekken 8": "https://upload.wikimedia.org/wikipedia/en/0/06/Tekken_8_cover_art.jpg",
  "Mortal Kombat 1": "https://upload.wikimedia.org/wikipedia/en/1/12/Mortal_Kombat_1_cover_art.jpg",
  "Spider-Man 2": "https://upload.wikimedia.org/wikipedia/en/0/0f/Spider-Man_2_PS5_box_art.jpg",
  "Alan Wake 2": "https://upload.wikimedia.org/wikipedia/en/e/ed/Alan_Wake_2_box_art.jpg",
  "Lies of P": "https://upload.wikimedia.org/wikipedia/en/1/13/Lies_of_P_cover_art.jpg",
  "Sea of Stars": "https://upload.wikimedia.org/wikipedia/en/d/d4/Sea_of_Stars_cover_art.jpg",
  "Dave the Diver": "https://upload.wikimedia.org/wikipedia/en/3/33/Dave_the_Diver_cover_art.jpg",
  "Fallout": "https://upload.wikimedia.org/wikipedia/en/a/af/Fallout.jpg",
  "Diablo": "https://upload.wikimedia.org/wikipedia/en/3/3a/Diablo_Coverart.png",
  "StarCraft": "https://upload.wikimedia.org/wikipedia/en/2/20/StarCraft_box_art.jpg",
  "Warcraft III": "https://upload.wikimedia.org/wikipedia/en/b/b7/Warcraft_III_Reign_of_Chaos_Box_Art.jpg",
  "Age of Empires II": "https://upload.wikimedia.org/wikipedia/en/5/56/Age_of_Empires_II_-_The_Age_of_Kings_Coverart.png",
  "Command & Conquer": "https://upload.wikimedia.org/wikipedia/en/1/1a/Command_%26_Conquer_Coverart.png",
  "Red Alert": "https://upload.wikimedia.org/wikipedia/en/4/4b/Command_%26_Conquer_Red_Alert_Coverart.png",
  "SimCity 2000": "https://upload.wikimedia.org/wikipedia/en/b/b3/SimCity_2000_Cover.jpg",
  "The Sims": "https://upload.wikimedia.org/wikipedia/en/b/bb/The_Sims_Coverart.png",
  "RollerCoaster Tycoon": "https://upload.wikimedia.org/wikipedia/en/1/1d/RollerCoaster_Tycoon_Box_Art.jpg",
  "Theme Hospital": "https://upload.wikimedia.org/wikipedia/en/9/97/Theme_Hospital_Coverart.png",
  "Grim Fandango": "https://upload.wikimedia.org/wikipedia/en/3/31/Grim_Fandango_box_art.jpg",
  "Monkey Island": "https://upload.wikimedia.org/wikipedia/en/a/a8/The_Secret_of_Monkey_Island_artwork.jpg",
  "Day of the Tentacle": "https://upload.wikimedia.org/wikipedia/en/7/79/Day_of_the_Tentacle_artwork.jpg",
  "Full Throttle": "https://upload.wikimedia.org/wikipedia/en/6/6b/Full_Throttle_artwork.jpg",
  "Deus Ex": "https://upload.wikimedia.org/wikipedia/en/b/b5/Deus_Ex_Cover.jpg",
  "System Shock 2": "https://upload.wikimedia.org/wikipedia/en/b/b3/System_Shock_2_cover.jpg",
  "Thief: The Dark Project": "https://upload.wikimedia.org/wikipedia/en/d/d1/Thief_The_Dark_Project_Coverart.png",
  "Baldur's Gate II": "https://upload.wikimedia.org/wikipedia/en/f/f0/Baldur%27s_Gate_II_-_Shadows_of_Amn_Coverart.png",
  "Planescape: Torment": "https://upload.wikimedia.org/wikipedia/en/b/b2/Planescape_Torment_box_art.jpg",
  "Icewind Dale": "https://upload.wikimedia.org/wikipedia/en/d/d4/Icewind_Dale_Coverart.png",
  "Grand Theft Auto": "https://upload.wikimedia.org/wikipedia/en/4/4c/GTA_-_PC_-_Box_Art.jpg",
  "Grand Theft Auto 2": "https://upload.wikimedia.org/wikipedia/en/2/23/Gta2_box.jpg",
  "Grand Theft Auto III": "https://upload.wikimedia.org/wikipedia/en/b/be/GTA3_Box_Art.jpg",
  "Grand Theft Auto: Vice City": "https://upload.wikimedia.org/wikipedia/en/c/ce/Vice-city-cover.jpg",
  "Grand Theft Auto: San Andreas": "https://upload.wikimedia.org/wikipedia/en/c/c4/GTASABOX.jpg",
  "Halo 2": "https://upload.wikimedia.org/wikipedia/en/9/92/Halo2-cover.png",
  "Halo 3": "https://upload.wikimedia.org/wikipedia/en/b/b4/Halo_3_boxart.jpg",
  "BioShock 2": "https://upload.wikimedia.org/wikipedia/en/6/63/Bioshock2boxart.jpg",
  "BioShock Infinite": "https://upload.wikimedia.org/wikipedia/en/a/a3/BioShock_Infinite_cover.php.jpg",
  "Uncharted: Drake's Fortune": "https://upload.wikimedia.org/wikipedia/en/b/b3/Uncharted_Drakes_Fortune_box_art.jpg",
  "Uncharted 3: Drake's Deception": "https://upload.wikimedia.org/wikipedia/en/1/1a/Uncharted_3_box_art.jpg",
  "Gears of War": "https://upload.wikimedia.org/wikipedia/en/b/b4/Gears_of_War_1_cover.jpg",
  "Gears of War 2": "https://upload.wikimedia.org/wikipedia/en/d/d9/Gears_of_War_2_cover.jpg",
  "Gears of War 3": "https://upload.wikimedia.org/wikipedia/en/4/4d/Gears_of_War_3_cover.jpg",
  "Fable": "https://upload.wikimedia.org/wikipedia/en/e/e6/Fable_box_art.jpg",
  "Fable II": "https://upload.wikimedia.org/wikipedia/en/f/f6/Fable_II_box_art.jpg",
  "Left 4 Dead": "https://upload.wikimedia.org/wikipedia/en/0/0a/Left4Dead_Windows_cover.jpg",
  "Left 4 Dead 2": "https://upload.wikimedia.org/wikipedia/en/5/5a/Left4Dead2_Windows_cover.jpg",
  "Dead Space": "https://upload.wikimedia.org/wikipedia/en/2/23/Dead_Space_Box_Art.jpg",
  "Dead Space 2": "https://upload.wikimedia.org/wikipedia/en/e/e3/Dead_Space_2_Box_Art.jpg",
  "Mirror's Edge": "https://upload.wikimedia.org/wikipedia/en/2/2e/MirrorsEdge_box_art.jpg",
  "Assassin's Creed": "https://upload.wikimedia.org/wikipedia/en/5/52/Assassin%27s_Creed.jpg",
  "Assassin's Creed II": "https://upload.wikimedia.org/wikipedia/en/a/a5/Assassins_Creed_II_Box_Art.jpg",
  "Assassin's Creed: Brotherhood": "https://upload.wikimedia.org/wikipedia/en/b/bb/Assassins_Creed_Brotherhood_Box_Art.jpg",
  "Assassin's Creed IV: Black Flag": "https://upload.wikimedia.org/wikipedia/en/2/2b/Assassin%27s_Creed_IV_Black_Flag_cover.jpg",
  "Far Cry 3": "https://upload.wikimedia.org/wikipedia/en/3/3b/Far_Cry_3_Box_Art.jpg",
  "Far Cry 4": "https://upload.wikimedia.org/wikipedia/en/2/21/Far_Cry_4_box_art.jpg",
  "Batman: Arkham Asylum": "https://upload.wikimedia.org/wikipedia/en/e/e1/Batman_Arkham_Asylum_Box_Art.jpg",
  "Batman: Arkham City": "https://upload.wikimedia.org/wikipedia/en/0/00/Batman_Arkham_City_Game_Cover.jpg",
  "Batman: Arkham Knight": "https://upload.wikimedia.org/wikipedia/en/6/66/Batman_Arkham_Knight_Cover_Art.jpg",
  "Borderlands": "https://upload.wikimedia.org/wikipedia/en/b/bf/Borderlands_box_art.png",
  "Borderlands 2": "https://upload.wikimedia.org/wikipedia/en/5/51/Borderlands_2_cover_art.png",
  "Dishonored": "https://upload.wikimedia.org/wikipedia/en/0/01/Dishonored_Box_Art.jpg",
  "Dishonored 2": "https://upload.wikimedia.org/wikipedia/en/e/ed/Dishonored_2_cover_art.jpg",
  "Wolfenstein: The New Order": "https://upload.wikimedia.org/wikipedia/en/e/e7/Wolfenstein_The_New_Order_box_art.jpg",
  "Titanfall": "https://upload.wikimedia.org/wikipedia/en/b/bb/Titanfall_box_art.jpg",
  "Overwatch": "https://upload.wikimedia.org/wikipedia/en/5/51/Overwatch_cover_art.jpg",
  "Team Fortress 2": "https://upload.wikimedia.org/wikipedia/en/5/53/Team_Fortress_2_box_art.jpg",
  "Cuphead": "https://upload.wikimedia.org/wikipedia/en/3/3b/Cuphead_cover_art.png",
  "Hollow Knight": "https://upload.wikimedia.org/wikipedia/en/f/f1/Hollow_Knight_cover.jpg",
  "Celeste": "https://upload.wikimedia.org/wikipedia/en/c/c4/Celeste_box_art.png",
  "Shovel Knight": "https://upload.wikimedia.org/wikipedia/en/1/15/Shovel_Knight_cover_art.jpg",
  "Ratchet & Clank": "https://upload.wikimedia.org/wikipedia/en/e/e8/Ratchet_%26_Clank_PS4_box_art.jpg",
  "Jak and Daxter": "https://upload.wikimedia.org/wikipedia/en/a/a1/Jak_and_Daxter_The_Precursor_Legacy_Box_Art.jpg",
  "Sly Cooper": "https://upload.wikimedia.org/wikipedia/en/6/6e/Sly_Cooper_and_the_Thievius_Raccoonus_Box_Art.jpg",
  "Twisted Metal": "https://upload.wikimedia.org/wikipedia/en/2/2e/Twisted_Metal_1_Cover.jpg",
  "Tekken 3": "https://upload.wikimedia.org/wikipedia/en/7/73/Tekken_3_Coverart.png",
  "SoulCalibur": "https://upload.wikimedia.org/wikipedia/en/c/c5/SoulCalibur_Box_Art.jpg",
  "Need for Speed: Most Wanted": "https://upload.wikimedia.org/wikipedia/en/b/b3/Need_for_Speed_Most_Wanted_Box_Art.jpg",
  "Gran Turismo 3: A-Spec": "https://upload.wikimedia.org/wikipedia/en/2/2e/Gran_Turismo_3_A-Spec_Box_Art.jpg",
  "SSX Tricky": "https://upload.wikimedia.org/wikipedia/en/6/69/SSX_Tricky_Coverart.png",
  "Skate 3": "https://upload.wikimedia.org/wikipedia/en/b/b3/Skate_3_Box_Art.jpg",
  "Hogwarts Legacy": "https://upload.wikimedia.org/wikipedia/en/7/7c/Hogwarts_Legacy_cover_art.jpg",
  "The Legend of Zelda: Tears of the Kingdom": "https://upload.wikimedia.org/wikipedia/en/f/fb/The_Legend_of_Zelda_Tears_of_the_Kingdom_cover.jpg",
  "God of War Ragnarök": "https://upload.wikimedia.org/wikipedia/en/e/ee/God_of_War_Ragnar%C3%B6k_cover.jpg",
  "Marvel's Spider-Man 2": "https://upload.wikimedia.org/wikipedia/en/0/0f/Spider-Man_2_PS5_box_art.jpg",
  "Stray": "https://upload.wikimedia.org/wikipedia/en/f/f6/Stray_cover_art.jpg",
  "Sifu": "https://upload.wikimedia.org/wikipedia/en/0/0c/Sifu_cover_art.jpg",
  "Kena: Bridge of Spirits": "https://upload.wikimedia.org/wikipedia/en/c/c4/Kena_Bridge_of_Spirits_cover_art.jpg",
};

const getGameCover = (title: string) => {
  if (POPULAR_COVERS[title]) return POPULAR_COVERS[title];
  // Use a more reliable search-based placeholder for game covers
  return `https://loremflickr.com/300/400/${encodeURIComponent(title.replace(/:/g, '') + " video game cover")}`;
};


export default function App() {
  const [lang, setLang] = useState<Language>('es');
  const [view, setView] = useState<'home' | 'details'>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [visibleCount, setVisibleCount] = useState(GAMES_PER_PAGE);
  const [loading, setLoading] = useState(false);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [visitorCount, setVisitorCount] = useState(0);
  const [shareSuccess, setShareSuccess] = useState(false);
  const [t, setT] = useState(translations[lang]);

  useEffect(() => {
    setT(translations[lang]);
  }, [lang]);

  // Deep linking: check for ?game=Title on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gameTitle = params.get('game');
    if (gameTitle) {
      selectGame(gameTitle);
    }
  }, []);

  // Firebase Auth & Visitor Counter
  useEffect(() => {
    let unsubscribeStats: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);

      if (currentUser) {
        const userId = currentUser.uid;

        // Increment visitor count once per session for authenticated users
        const sessionKey = `aether_nexus_session_visited_${userId}`;
        if (!sessionStorage.getItem(sessionKey)) {
          const statsRef = doc(db, 'stats', 'global');
          try {
            await runTransaction(db, async (transaction) => {
              const statsDoc = await transaction.get(statsRef);
              if (!statsDoc.exists()) {
                transaction.set(statsRef, { visitors: 15421 }); 
              } else {
                const newCount = (statsDoc.data().visitors || 0) + 1;
                transaction.update(statsRef, { visitors: newCount });
              }
            });
            sessionStorage.setItem(sessionKey, 'true');
          } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, 'stats/global');
          }
        }
      }
    });

    // Real-time listener for visitor count (publicly readable)
    unsubscribeStats = onSnapshot(doc(db, 'stats', 'global'), (doc) => {
      if (doc.exists()) {
        setVisitorCount(doc.data().visitors || 0);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'stats/global');
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeStats) unsubscribeStats();
    };
  }, []);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("Login failed:", err);
      setError(lang === 'es' ? 'Error al iniciar sesión con Google.' : 'Failed to sign in with Google.');
    }
  };

  const logout = async () => {
    try {
      await auth.signOut();
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  // Filter games based on search query
  const filteredGames = useMemo(() => {
    if (!searchQuery.trim()) return POPULAR_GAMES_LIST;
    return POPULAR_GAMES_LIST.filter(title => 
      title.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  // Paginated games
  const paginatedGames = useMemo(() => {
    return filteredGames.slice(0, visibleCount);
  }, [filteredGames, visibleCount]);

  const handleSearch = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (filteredGames.length > 0 && searchQuery.trim()) {
      selectGame(filteredGames[0]);
    }
  };

  const selectGame = async (title: string) => {
    // 1. Instant transition with basic info
    setSelectedGame({ 
      title, 
      id: 'pending',
      description: '',
      developer: '',
      releaseDate: '',
      minAge: '',
      systemRequirements: { minimum: '', recommended: '' },
      downloadLink: '',
      platforms: [],
      genre: '',
      rating: 0,
      imageUrl: getGameCover(title)
    });
    setView('details');
    setIsFetchingDetails(true);
    setError(null);
    
    const loadingMessages = lang === 'es' 
      ? ['Sincronizando con el Nexo...', 'Escaneando base de datos...', 'Cargando protocolos...', 'Estableciendo conexión...']
      : ['Syncing with the Nexus...', 'Scanning database...', 'Loading protocols...', 'Establishing connection...'];
    
    setLoadingMessage(loadingMessages[Math.floor(Math.random() * loadingMessages.length)]);

    try {
      const details = await getGameDetails(title, lang);
      if (details) {
        setSelectedGame(details);
      } else {
        setError(lang === 'es' ? 'No se pudo obtener la información del juego. Inténtalo de nuevo.' : 'Could not fetch game details. Please try again.');
        setView('home');
      }
    } catch (err) {
      setError(lang === 'es' ? 'Error de conexión. Verifica tu red.' : 'Connection error. Please check your network.');
      setView('home');
    } finally {
      setIsFetchingDetails(false);
    }
  };

  const loadMore = () => {
    setVisibleCount(prev => prev + GAMES_PER_PAGE);
  };

  const shareGame = async (game: Game) => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?game=${encodeURIComponent(game.title)}`;
    const shareText = lang === 'es' 
      ? `¡Mira este juego en AetherNexus: ${game.title}!` 
      : `Check out this game on AetherNexus: ${game.title}!`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: game.title,
          text: shareText,
          url: shareUrl,
        });
      } catch (err) {
        console.error("Error sharing:", err);
      }
    } else {
      // Fallback: Copy to clipboard
      try {
        await navigator.clipboard.writeText(shareUrl);
        setShareSuccess(true);
        setTimeout(() => setShareSuccess(false), 2000);
      } catch (err) {
        console.error("Error copying to clipboard:", err);
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass-card m-4 px-6 py-3 flex items-center justify-between">
        <div 
          className="flex items-center gap-2 cursor-pointer" 
          onClick={() => {
            setView('home');
            setSearchQuery('');
            setVisibleCount(GAMES_PER_PAGE);
          }}
        >
          <div className="w-10 h-10 bg-gradient-to-br from-neon-cyan to-neon-purple rounded-lg flex items-center justify-center shadow-lg shadow-neon-cyan/20">
            <Gamepad2 className="text-white" />
          </div>
          <span className="text-2xl font-bold tracking-tighter neon-text">AETHER<span className="text-neon-cyan">NEXUS</span></span>
        </div>

        <div className="flex items-center gap-4">
          <form onSubmit={handleSearch} className="hidden md:flex relative group">
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setVisibleCount(GAMES_PER_PAGE);
              }}
              placeholder={t.searchPlaceholder}
              className="bg-white/5 border border-white/10 rounded-full px-10 py-2 w-64 focus:w-80 focus:border-neon-cyan focus:outline-none transition-all duration-300"
            />
            <Search className="absolute left-3 top-2.5 text-white/40 group-focus-within:text-neon-cyan transition-colors" size={18} />
          </form>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => setLang(lang === 'es' ? 'en' : 'es')}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
            >
              <Globe size={16} className="text-neon-cyan" />
              <span className="text-sm font-medium uppercase">{lang}</span>
            </button>

            {user ? (
              <div className="flex items-center gap-2">
                <div className="hidden lg:block text-right">
                  <p className="text-[10px] text-white/40 uppercase font-bold tracking-tighter leading-none">Conectado</p>
                  <p className="text-xs font-bold text-neon-cyan truncate max-w-[80px]">{user.displayName?.split(' ')[0]}</p>
                </div>
                <button 
                  onClick={logout}
                  className="p-2 rounded-full bg-white/5 hover:bg-red-500/20 transition-all border border-white/10 group"
                  title={lang === 'es' ? 'Cerrar Sesión' : 'Logout'}
                >
                  <LogOut size={18} className="group-hover:text-red-400" />
                </button>
              </div>
            ) : (
              <button 
                onClick={login}
                className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-neon-cyan text-black text-xs font-black hover:bg-white transition-all shadow-lg shadow-neon-cyan/20"
              >
                <LogIn size={14} />
                <span className="hidden sm:inline">{lang === 'es' ? 'ACCEDER' : 'LOGIN'}</span>
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Error Message */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 glass-card px-6 py-3 border-red-500/50 flex items-center gap-3"
          >
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm font-medium">{error}</span>
            <button 
              onClick={() => setError(null)}
              className="ml-4 text-white/40 hover:text-white"
            >
              <Plus className="rotate-45" size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-grow pt-28 px-4 md:px-8 max-w-7xl mx-auto w-full">
        <AnimatePresence mode="wait">
          {view === 'home' && (
            <motion.div 
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-12"
            >
              {/* Hero Section */}
              <section className="text-center space-y-6 py-12">
                <motion.h1 
                  initial={{ scale: 0.9 }}
                  animate={{ scale: 1 }}
                  className="text-6xl md:text-8xl font-black tracking-tighter"
                >
                  <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-neon-cyan to-neon-purple">
                    {t.heroTitle}
                  </span>
                </motion.h1>
                <p className="text-xl text-white/60 max-w-2xl mx-auto font-medium">
                  {t.heroSubtitle}
                </p>
                <div className="flex justify-center pt-4 md:hidden">
                  <div className="relative w-full max-w-xs">
                    <input 
                      type="text" 
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setVisibleCount(GAMES_PER_PAGE);
                      }}
                      placeholder={t.searchPlaceholder}
                      className="bg-white/5 border border-white/10 rounded-full px-10 py-3 w-full focus:border-neon-cyan focus:outline-none transition-all"
                    />
                    <Search className="absolute left-3 top-3.5 text-white/40" size={18} />
                  </div>
                </div>
              </section>

              {/* Games Grid */}
              <section className="space-y-8">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
                    <Star className="text-neon-purple" fill="currentColor" />
                    {lang === 'es' ? 'Lista de Juegos' : 'Game List'}
                  </h2>
                  <span className="text-white/40 text-xs md:text-sm font-mono">
                    {filteredGames.length} {lang === 'es' ? 'Títulos' : 'Titles'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 md:gap-6">
                  {paginatedGames.map((title, idx) => (
                    <motion.div 
                      key={title + idx}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: (idx % GAMES_PER_PAGE) * 0.01 }}
                      whileHover={{ y: -5 }}
                      onClick={() => selectGame(title)}
                      className="glass-card p-2 md:p-4 neon-border cursor-pointer group flex flex-col"
                    >
                      <div className="aspect-[3/4] rounded-lg overflow-hidden mb-2 md:mb-4 bg-white/5 relative">
                        <img 
                          src={getGameCover(title)} 
                          alt={title}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = `https://picsum.photos/seed/${encodeURIComponent(title)}/300/400`;
                          }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-2">
                          <span className="text-[8px] md:text-xs font-bold text-neon-cyan uppercase tracking-widest">Detalles</span>
                          <Download size={14} className="text-neon-cyan" />
                        </div>
                        <div className="absolute top-1 right-1 md:top-2 md:right-2 px-1.5 py-0.5 bg-black/60 backdrop-blur-md rounded flex items-center gap-1 border border-white/10">
                          <Users size={10} className="text-neon-cyan" />
                          <span className="text-[8px] md:text-[10px] font-bold">{getPlayerCount(title)}</span>
                        </div>
                      </div>
                      <h3 className="text-[10px] md:text-base font-bold truncate leading-tight">{title}</h3>
                      <div className="flex items-center justify-between mt-1 hidden md:flex">
                        <p className="text-[8px] text-white/40">
                          {lang === 'es' ? 'Info' : 'Info'}
                        </p>
                        <div className="flex items-center gap-1 text-neon-cyan/60">
                          <Users size={10} />
                          <span className="text-[8px] font-mono">{lang === 'es' ? 'Jugadores' : 'Players'}</span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {visibleCount < filteredGames.length && (
                  <div className="flex justify-center py-12">
                    <button 
                      onClick={loadMore}
                      className="px-8 py-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 hover:border-neon-cyan transition-all flex items-center gap-2 font-bold"
                    >
                      <Plus size={20} className="text-neon-cyan" />
                      {lang === 'es' ? 'Cargar más' : 'Load more'}
                    </button>
                  </div>
                )}

                {filteredGames.length === 0 && (
                  <div className="text-center py-20 space-y-4">
                    <p className="text-2xl text-white/20 font-black tracking-widest uppercase">{t.noResults}</p>
                    <button 
                      onClick={() => setSearchQuery('')}
                      className="text-neon-cyan hover:underline"
                    >
                      {lang === 'es' ? 'Limpiar búsqueda' : 'Clear search'}
                    </button>
                  </div>
                )}
              </section>
            </motion.div>
          )}

          {view === 'details' && selectedGame && (
            <motion.div 
              key="details"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-20"
            >
              <div className="lg:col-span-2 space-y-8">
                <button 
                  onClick={() => setView('home')}
                  className="flex items-center gap-2 text-white/60 hover:text-neon-cyan transition-colors"
                >
                  <ChevronLeft size={20} />
                  {t.backToHome}
                </button>

                <div className="relative aspect-video rounded-3xl overflow-hidden shadow-2xl shadow-neon-cyan/10">
                  <img 
                    src={selectedGame.imageUrl} 
                    alt={selectedGame.title}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://picsum.photos/seed/${encodeURIComponent(selectedGame.title)}/800/450`;
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
                  <div className="absolute bottom-8 left-8 right-8">
                    <div className="flex items-center gap-2 mb-2">
                      {selectedGame.platforms.map(p => (
                        <span key={p} className="px-2 py-1 bg-white/10 backdrop-blur-md rounded text-[10px] uppercase font-bold tracking-widest border border-white/10">
                          {p}
                        </span>
                      ))}
                    </div>
                    <h1 className="text-5xl font-black tracking-tighter mb-2">{selectedGame.title}</h1>
                    <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
                      <div className="flex items-center gap-4 text-white/60">
                        {isFetchingDetails ? (
                          <div className="flex items-center gap-4">
                            <div className="h-4 w-12 bg-white/10 rounded animate-pulse" />
                            <div className="h-4 w-20 bg-white/10 rounded animate-pulse" />
                            <div className="h-4 w-24 bg-white/10 rounded animate-pulse" />
                          </div>
                        ) : (
                          <>
                            <span className="flex items-center gap-1"><Star size={16} className="text-yellow-400 fill-yellow-400" /> {selectedGame.rating}/10</span>
                            <span>•</span>
                            <span>{selectedGame.genre}</span>
                            <span>•</span>
                            <span>{selectedGame.releaseDate}</span>
                          </>
                        )}
                      </div>
                      
                      <a 
                        href={selectedGame.downloadLink || '#'} 
                        target={selectedGame.downloadLink ? "_blank" : "_self"}
                        rel="noopener noreferrer"
                        onClick={(e) => !selectedGame.downloadLink && e.preventDefault()}
                        className={`flex items-center gap-2 px-6 py-2 rounded-full font-black transition-all shadow-lg w-fit ${
                          isFetchingDetails 
                            ? 'bg-white/5 text-white/20 cursor-wait border border-white/10' 
                            : 'bg-neon-cyan text-black hover:bg-white shadow-neon-cyan/40'
                        }`}
                      >
                        {isFetchingDetails ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                        {isFetchingDetails ? (lang === 'es' ? 'BUSCANDO LINK...' : 'FETCHING LINK...') : t.downloadNow}
                      </a>
                    </div>
                  </div>
                </div>

                <div className="glass-card p-8 space-y-6">
                  <h3 className="text-2xl font-bold border-l-4 border-neon-cyan pl-4 uppercase tracking-widest">
                    {lang === 'es' ? 'SINOPSIS' : 'SYNOPSIS'}
                  </h3>
                  {isFetchingDetails ? (
                    <div className="space-y-3">
                      <div className="h-4 w-full bg-white/5 rounded animate-pulse" />
                      <div className="h-4 w-full bg-white/5 rounded animate-pulse" />
                      <div className="h-4 w-3/4 bg-white/5 rounded animate-pulse" />
                    </div>
                  ) : (
                    <p className="text-lg text-white/80 leading-relaxed">
                      {selectedGame.description}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="glass-card p-6 space-y-4">
                    <h4 className="flex items-center gap-2 font-bold text-neon-cyan uppercase tracking-wider">
                      <Cpu size={18} />
                      {t.systemRequirements} (Min)
                    </h4>
                    {isFetchingDetails ? (
                      <div className="h-20 w-full bg-white/5 rounded-xl animate-pulse" />
                    ) : (
                      <p className="text-sm text-white/60 whitespace-pre-line bg-black/20 p-4 rounded-xl border border-white/5">
                        {selectedGame.systemRequirements.minimum}
                      </p>
                    )}
                  </div>
                  <div className="glass-card p-6 space-y-4">
                    <h4 className="flex items-center gap-2 font-bold text-neon-purple uppercase tracking-wider">
                      <Monitor size={18} />
                      {t.systemRequirements} (Rec)
                    </h4>
                    {isFetchingDetails ? (
                      <div className="h-20 w-full bg-white/5 rounded-xl animate-pulse" />
                    ) : (
                      <p className="text-sm text-white/60 whitespace-pre-line bg-black/20 p-4 rounded-xl border border-white/5">
                        {selectedGame.systemRequirements.recommended}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="glass-card p-8 sticky top-28 space-y-8">
                  <div className="grid grid-cols-1 gap-4">
                    <a 
                      href={selectedGame.downloadLink} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="w-full py-4 bg-gradient-to-r from-neon-cyan to-neon-purple text-white font-black rounded-xl flex items-center justify-center gap-3 hover:scale-[1.02] transition-transform shadow-xl shadow-neon-cyan/20"
                    >
                      <Download size={24} />
                      {t.downloadNow}
                    </a>
                    
                    <button 
                      onClick={() => shareGame(selectedGame)}
                      className="w-full py-4 bg-white/5 border-2 border-white/10 text-white/60 font-black rounded-xl flex items-center justify-center gap-3 hover:bg-white/10 hover:border-neon-cyan transition-all"
                    >
                      {shareSuccess ? <Check size={24} className="text-neon-cyan" /> : <Share2 size={24} />}
                      {shareSuccess 
                        ? (lang === 'es' ? '¡COPIADO!' : 'COPIED!') 
                        : (lang === 'es' ? 'COMPARTIR' : 'SHARE')}
                    </button>
                  </div>

                  <div className="space-y-6 divide-y divide-white/10">
                    <div className="flex justify-between items-center pt-0">
                      <div className="flex items-center gap-3 text-white/60">
                        <UserIcon size={20} />
                        <span>{t.minAge}</span>
                      </div>
                      {isFetchingDetails ? (
                        <div className="h-4 w-12 bg-white/5 rounded animate-pulse" />
                      ) : (
                        <span className="font-bold text-neon-cyan">{selectedGame.minAge}</span>
                      )}
                    </div>
                    
                    <div className="flex justify-between items-center pt-6">
                      <div className="flex items-center gap-3 text-white/60">
                        <Gamepad2 size={20} />
                        <span>{t.developer}</span>
                      </div>
                      {isFetchingDetails ? (
                        <div className="h-4 w-24 bg-white/5 rounded animate-pulse" />
                      ) : (
                        <span className="font-bold text-right">{selectedGame.developer}</span>
                      )}
                    </div>

                    <div className="flex flex-col gap-3 pt-6">
                      <div className="flex items-center gap-3 text-white/60">
                        <Monitor size={20} />
                        <span>{t.platforms}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {isFetchingDetails ? (
                          <>
                            <div className="h-6 w-16 bg-white/5 rounded-full animate-pulse" />
                            <div className="h-6 w-20 bg-white/5 rounded-full animate-pulse" />
                          </>
                        ) : (
                          selectedGame.platforms.map(p => (
                            <span key={p} className="px-3 py-1 bg-white/5 rounded-full text-xs border border-white/10">
                              {p}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="pt-4">
                    <div className="p-4 bg-neon-cyan/10 rounded-2xl border border-neon-cyan/20">
                      <p className="text-xs text-neon-cyan font-bold uppercase tracking-widest mb-1">Status</p>
                      <p className="text-sm font-medium">Verified Data Stream Active</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Global Loading Overlay */}
      <AnimatePresence>
        {loading && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center gap-8"
          >
            <div className="relative">
              <div className="w-24 h-24 border-4 border-neon-cyan/20 border-t-neon-cyan rounded-full animate-spin" />
              <div className="absolute inset-0 w-24 h-24 border-4 border-neon-purple/20 border-b-neon-purple rounded-full animate-spin-slow" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Gamepad2 className="text-white animate-pulse" size={32} />
              </div>
            </div>
            <div className="text-center space-y-4">
              <div className="space-y-1">
                <p className="text-3xl font-black tracking-[0.2em] neon-text uppercase">
                  {lang === 'es' ? 'SINCRONIZANDO' : 'SYNCHRONIZING'}
                </p>
                <div className="h-1 w-48 bg-white/10 mx-auto rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ x: '-100%' }}
                    animate={{ x: '100%' }}
                    transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                    className="h-full w-1/2 bg-gradient-to-r from-neon-cyan to-neon-purple"
                  />
                </div>
              </div>
              <p className="text-white/60 font-medium tracking-wide">
                {loadingMessage || t.loading}
              </p>
              <div className="flex items-center justify-center gap-4 text-[10px] text-white/20 font-mono uppercase tracking-[0.3em]">
                <span>Aether Protocol v4.2</span>
                <span className="w-1 h-1 rounded-full bg-white/20" />
                <span>Secure Link Active</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Footer with Visitor Counter */}
      <footer className="mt-20 py-12 border-t border-white/5 bg-black/40 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 md:px-8 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="space-y-2 text-center md:text-left">
            <span className="text-xl font-bold tracking-tighter neon-text">AETHER<span className="text-neon-cyan">NEXUS</span></span>
            <p className="text-xs text-white/40 font-mono uppercase tracking-widest">© 2026 AetherNexus Gaming Hub</p>
          </div>

          <div className="glass-card px-6 py-4 flex items-center gap-6 neon-border">
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-1">Visitantes</span>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-neon-cyan animate-pulse" />
                <span className="text-2xl font-black tracking-tighter font-mono">{visitorCount.toLocaleString()}</span>
              </div>
            </div>
            <div className="w-px h-10 bg-white/10" />
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-1">Estado</span>
              <span className="text-xs font-bold text-neon-cyan uppercase tracking-widest">En Línea</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 hover:border-neon-purple transition-all">
              <Globe size={18} className="text-white/60" />
            </button>
            <button className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 hover:border-neon-cyan transition-all">
              <Users size={18} className="text-white/60" />
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function AppWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
