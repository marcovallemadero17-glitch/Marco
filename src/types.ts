export interface Game {
  id: string;
  title: string;
  description: string;
  developer: string;
  releaseDate: string;
  minAge: string;
  systemRequirements: {
    minimum: string;
    recommended: string;
  };
  downloadLink: string;
  platforms: string[];
  genre: string;
  rating: number;
  imageUrl: string;
  price?: string;
}

export type Language = 'es' | 'en';

export interface Translation {
  heroTitle: string;
  heroSubtitle: string;
  searchPlaceholder: string;
  exploreCategories: string;
  downloadNow: string;
  systemRequirements: string;
  minAge: string;
  developer: string;
  platforms: string;
  backToHome: string;
  loading: string;
  noResults: string;
  price: string;
  visitors: string;
}

export const translations: Record<Language, Translation> = {
  es: {
    heroTitle: "AetherNexus",
    heroSubtitle: "Toda la información técnica y enlaces de descarga de tus juegos favoritos en un solo lugar.",
    searchPlaceholder: "Busca entre más de 1500 títulos...",
    exploreCategories: "Categorías Principales",
    downloadNow: "Descargar Ahora",
    systemRequirements: "Requisitos del Sistema",
    minAge: "Edad Mínima",
    developer: "Desarrolladora",
    platforms: "Plataformas",
    backToHome: "Volver al Inicio",
    loading: "Sincronizando con la red...",
    noResults: "No se encontraron datos en el sector.",
    price: "Precio",
    visitors: "Visitantes del Nexo"
  },
  en: {
    heroTitle: "AetherNexus",
    heroSubtitle: "All the technical info and download links for your favorite games in one place.",
    searchPlaceholder: "Search through 1500+ titles...",
    exploreCategories: "Main Categories",
    downloadNow: "Download Now",
    systemRequirements: "System Requirements",
    minAge: "Minimum Age",
    developer: "Developer",
    platforms: "Platforms",
    backToHome: "Back to Home",
    loading: "Syncing with the network...",
    noResults: "No data found in this sector.",
    price: "Price",
    visitors: "Nexus Visitors"
  }
};
