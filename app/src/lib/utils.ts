import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// A escala de texto HIG (text-cap1, text-foot, text-sub…) é personalizada: sem isto o tailwind-merge
// confunde `text-cap1` com cor e o descarta quando a mesma classe tem `text-green`, por exemplo.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["cap2", "cap1", "foot", "sub", "body", "t3", "t2", "t1", "lt", "disp"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
