import e01 from './E01.jpg';
import e02 from './E02.jpg';
import e03 from './E03.jpg';
import e04 from './E04-v2.jpg';
import e07 from './E07-v7.jpg';

const bundledEndingImages: Readonly<Record<string, string>> = {
  'E01.jpg': e01,
  'E02.jpg': e02,
  'E03.jpg': e03,
  'E04-v2.jpg': e04,
  'E07-v7.jpg': e07,
};

/** Local ending keys resolve to bundled data URLs; existing narrative URLs remain valid. */
export function resolveEndingImage(image: string | null | undefined): string | undefined {
  return image ? bundledEndingImages[image] || image : undefined;
}
