export interface HeroSlide {
  id: string;
  label: string;
  // Tailwind gradient classes used behind the image (and alone if no image is set).
  gradient: string;
  // Optional banner image under /public. HERO_IMAGES in data/assets.ts can also set it.
  image?: string;
}

// Homepage slides, in display order. Each slide is only its image; images are mapped by id in
// data/assets.ts (HERO_IMAGES).
export const HERO_SLIDES: HeroSlide[] = [
  {
    id: "flaming-hot",
    label: "Flaming Hot chicken burger",
    gradient: "from-red-700/50 to-zinc-900",
  },
  {
    id: "meg-classic",
    label: "MEG Classic black bun burger",
    gradient: "from-zinc-600 to-zinc-900",
  },
];
