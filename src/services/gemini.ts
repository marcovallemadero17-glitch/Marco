import { GoogleGenAI, Type } from "@google/genai";
import { Game } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

// Simple in-memory cache to speed up repeated requests
const gameCache: Record<string, Game> = {};

export async function getGameDetails(gameTitle: string, lang: 'es' | 'en'): Promise<Game | null> {
  const cacheKey = `${gameTitle}_${lang}`;
  if (gameCache[cacheKey]) {
    return gameCache[cacheKey];
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Provide detailed information about the video game "${gameTitle}" in ${lang === 'es' ? 'Spanish' : 'English'}. 
      Include: description, developer, release date, minimum age rating, system requirements (min and recommended), 
      a likely official download URL (Steam, Epic, or official site), platforms, genre, a rating out of 10, 
      and a high-quality official key art or cover image URL (prefer Steam CDN or official game site).`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            developer: { type: Type.STRING },
            releaseDate: { type: Type.STRING },
            minAge: { type: Type.STRING },
            systemRequirements: {
              type: Type.OBJECT,
              properties: {
                minimum: { type: Type.STRING },
                recommended: { type: Type.STRING }
              }
            },
            downloadLink: { type: Type.STRING },
            platforms: { type: Type.ARRAY, items: { type: Type.STRING } },
            genre: { type: Type.STRING },
            rating: { type: Type.NUMBER },
            imageUrl: { type: Type.STRING }
          },
          required: ["title", "description", "developer", "systemRequirements", "downloadLink", "platforms", "genre", "imageUrl"]
        }
      }
    });

    const data = JSON.parse(response.text || "{}");
    const game: Game = {
      ...data,
      id: Math.random().toString(36).substr(2, 9),
      imageUrl: data.imageUrl || `https://loremflickr.com/800/450/${encodeURIComponent(gameTitle + " key art")}`
    };

    // Store in cache
    gameCache[cacheKey] = game;
    return game;
  } catch (error) {
    console.error("Error fetching game details:", error);
    return null;
  }
}

export async function getPopularGames(lang: 'es' | 'en'): Promise<Partial<Game>[]> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `List 12 of the most played video games right now. Return only a JSON array of objects with "title" and "genre" in ${lang === 'es' ? 'Spanish' : 'English'}.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              genre: { type: Type.STRING }
            }
          }
        }
      }
    });

    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("Error fetching popular games:", error);
    return [];
  }
}
