// Personajes históricos y la mascota (Schrödingato). Punto de entrada del módulo.
import './characters.css';

export * from './data';
export { avatarSVG, animateAvatar, setExpression, characterName, MASCOT_AVATAR_ID, type AvatarOptions, type AvatarAction, type Expression } from './avatar';
export { CharacterFigure, type FigureOptions } from './figure';
export { MASCOT_MOODS, Mascot, mascotSVG, type MascotOptions, type MascotSVGOptions, type MascotMood, type MascotReaction, type MascotTheme } from './mascot';
export { MascotFigure, type MascotFigureOptions } from './mascot-figure';
export { tx, textKeys, randomKey } from './text';
