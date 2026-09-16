// Project + platform presets for the Social Asset Studio.
//
// A project only needs a slug (used as the R2 key prefix / library filter) and a label —
// there's no house color or logo baked in here, since guessing brand identity per project
// would just be wrong. Upload a logo once in the editor and it's remembered per-project
// (see LOGO_STORAGE_KEY in app.js) so it doesn't need re-uploading every session.
const PROJECTS = [
  { slug: "wizard-battle", label: "Wizard Battle" },
  { slug: "bluegrass-cube", label: "Bluegrass Cube" },
  { slug: "bluegrass-tcg", label: "Bluegrass TCG" },
  { slug: "bcs", label: "Bluegrass Cybersecurity Solutions" },
  { slug: "roto", label: "Roto" },
  { slug: "wintergreen", label: "Wintergreen" },
  { slug: "sumpthin", label: "Sumpthin" },
  { slug: "dropoutcube", label: "Dropoutcube" },
  { slug: "mcboop-news", label: "McBoop Daily" },
  { slug: "mcboop-sports", label: "McBoop Sports" },
  { slug: "radio", label: "Jared Luyster Radio" },
  { slug: "jaredluyster", label: "jaredluyster.com" },
];

const PLATFORMS = [
  { slug: "instagram-post", label: "Instagram Post", w: 1080, h: 1080 },
  { slug: "instagram-story", label: "Instagram/TikTok Story", w: 1080, h: 1920 },
  { slug: "twitter-post", label: "X / Twitter Post", w: 1600, h: 900 },
  { slug: "og-image", label: "Facebook / OG Image", w: 1200, h: 630 },
  { slug: "youtube-thumb", label: "YouTube Thumbnail", w: 1280, h: 720 },
  { slug: "custom", label: "Custom size", w: 1080, h: 1080 },
];

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "project";
}
