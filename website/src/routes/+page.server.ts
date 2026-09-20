import { renderSamples } from "$lib/landing";

// Runs when the site is built. The "after" samples on the page come from the real spall,
// so they can't drift from what the tool actually does.
export const prerender = true;

export async function load() {
  return await renderSamples();
}
