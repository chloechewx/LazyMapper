import { isAllowedLocalHost, isAllowedLocalOrigin, isPrivateStaticPath, isPublicStaticPath, publicStaticFilePath } from "../lib/server-security.mjs";

assertEqual(isPrivateStaticPath(".env"), true, "environment file");
assertEqual(isPrivateStaticPath(".env.local"), true, "environment variant");
assertEqual(isPrivateStaticPath(".git/config"), true, "nested repository metadata");
assertEqual(isPrivateStaticPath("assets/.private/file.txt"), true, "nested dot directory");
assertEqual(isPrivateStaticPath("index.html"), false, "public index");
assertEqual(isPrivateStaticPath("data/vietnam_enriched.json"), false, "public app data");

assertEqual(isPublicStaticPath("index.html"), true, "serves app shell");
assertEqual(publicStaticFilePath("index.html"), "dist/index.html", "maps app shell to production build");
assertEqual(isPublicStaticPath("assets/index-a1b2c3.js"), true, "serves compiled JavaScript");
assertEqual(isPublicStaticPath("assets/index-a1b2c3.css"), true, "serves compiled CSS");
assertEqual(publicStaticFilePath("assets/index-a1b2c3.js"), "dist/assets/index-a1b2c3.js", "maps compiled asset");
assertEqual(isPublicStaticPath("app.js"), false, "blocks legacy browser code");
assertEqual(isPublicStaticPath("styles.css"), false, "blocks legacy stylesheet");
assertEqual(isPublicStaticPath("data/vietnam_enriched.json"), true, "serves explicit research cache");
assertEqual(isPublicStaticPath("your_instagram_activity/saved/saved_collections.json"), true, "serves explicit local collection");
assertEqual(isPublicStaticPath("server.mjs"), false, "blocks server source");
assertEqual(isPublicStaticPath("package.json"), false, "blocks package metadata");
assertEqual(isPublicStaticPath("your_instagram_activity/comments/post_comments.json"), false, "blocks unrelated Instagram activity");
assertEqual(isPublicStaticPath("assets/../server.mjs"), false, "blocks asset traversal");
assertEqual(isPublicStaticPath("assets/.private.js"), false, "blocks hidden assets");
assertEqual(isPublicStaticPath("assets/nested/index.js"), false, "blocks unexpected nested assets");

assertEqual(isAllowedLocalHost("127.0.0.1:4173"), true, "allows loopback host");
assertEqual(isAllowedLocalHost("localhost:4173"), true, "allows localhost");
assertEqual(isAllowedLocalHost("evil.example"), false, "blocks external host");
assertEqual(isAllowedLocalHost("127.0.0.1.evil.example"), false, "blocks lookalike host");
assertEqual(isAllowedLocalOrigin("http://127.0.0.1:4173"), true, "allows loopback origin");
assertEqual(isAllowedLocalOrigin("http://localhost:4173"), true, "allows localhost origin");
assertEqual(isAllowedLocalOrigin("https://evil.example"), false, "blocks external origin");
console.log("Server security tests passed.");

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}
