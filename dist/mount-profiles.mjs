// Author: CA
// Reviewed source item identities. These are profile preferences, not measured
// sight heights; unknown mounts are neutral and never guessed from "lower rail".
export const HIGH_MOUNTS=new Set(['58d39b0386f77443380bf13c','5a33b652c4a28232996e407c','5c064c400db834001d23f468','5c7d560b2e22160bc12c6139','62e7c8f91cd3fde4d503d690','6985bee16be2752c150e689b','6a16dc0b82cfbdc3ab09f58a']);
export const LOW_MOUNTS=new Set(['5926dad986f7741f82604363','5a33b2c9c4a282000c5a9511','5dff8db859400025ea5150d4','62ebba1fb658e07ef9082b5a','638db77630c4240f9e06f8b6','6a16dc17b7b9778bee072c65']);
export const mountProfile=item=>HIGH_MOUNTS.has(item?.id)?'high':LOW_MOUNTS.has(item?.id)?'low':null;
// Specialized housings stay available, but practical mode prefers ordinary
// mounting routes. This is a preference, not a compatibility restriction.
export const SPECIAL_MOUNTS=new Set(['61714b2467085e45ef140b2c']); // T-1 Sunshade
export const isSpecialMount=item=>SPECIAL_MOUNTS.has(item?.id);
