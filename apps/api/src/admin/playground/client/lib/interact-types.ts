export const INTERACT_LANGUAGES = ["node", "bash", "python"] as const;

export type InteractLanguage = (typeof INTERACT_LANGUAGES)[number];
